import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { capabilityCatalog, listCapabilitiesByGroup, primarySurface } from "@/core/capabilities";
import { apiFetch, clearSessionToken, localClientConfig, readSessionToken, saveSessionToken } from "@/local/client";

const args = Bun.argv.slice(2);
const command = args[0] ?? "help";
const subcommand = args[1];

const serverUrl = localClientConfig.serverUrl;

const envStatus = () => {
  const envKeys = [
    ["DATABASE_URL", Boolean(process.env.DATABASE_URL)],
    ["TURSO_TOKEN", Boolean(process.env.TURSO_TOKEN)],
    ["TURSO_AUTH_TOKEN", Boolean(process.env.TURSO_AUTH_TOKEN)],
    ["TURBO_TOKEN", Boolean(process.env.TURBO_TOKEN)],
    ["BETTER_AUTH_SECRET", Boolean(process.env.BETTER_AUTH_SECRET)],
    ["BETTER_AUTH_URL", Boolean(process.env.BETTER_AUTH_URL)],
    ["GITHUB_CLIENT_ID", Boolean(process.env.GITHUB_CLIENT_ID)],
    ["GITHUB_CLIENT_SECRET", Boolean(process.env.GITHUB_CLIENT_SECRET)],
  ] as const;

  console.log("Environment");
  for (const [key, isSet] of envKeys) {
    console.log(`- ${key}: ${isSet ? "set" : "missing"}`);
  }
};

const printHelp = () => {
  console.log("ShareMyMarkdown CLI");
  console.log("");
  console.log(`Primary surface: ${primarySurface}`);
  console.log(`Server URL: ${serverUrl}`);
  console.log("");
  console.log("Usage:");
  console.log("  bun run cli help");
  console.log("  bun run cli status");
  console.log("  bun run cli capabilities");
  console.log("  bun run cli auth login");
  console.log("  bun run cli auth status");
  console.log("  bun run cli auth logout");
  console.log("  bun run cli docs list");
  console.log("  bun run cli docs create <title>");
  console.log("  bun run cli docs get <document-id>");
  console.log("  bun run cli docs edit <document-id>");
  console.log("  bun run cli docs presence <document-id>");
  console.log("  bun run cli versions list <document-id>");
  console.log("  bun run cli versions save <document-id> <message>");
  console.log("  bun run cli versions diff <document-id> <from-version-id> <to-version-id>");
  console.log("  bun run cli versions restore <document-id> <version-id>");
  console.log("  bun run cli revisions list <document-id>");
  console.log("  bun run cli revisions create <document-id> <title>");
  console.log("  bun run cli revisions get <document-id> <revision-id>");
  console.log("  bun run cli revisions edit <document-id> <revision-id>");
  console.log("  bun run cli revisions diff <document-id> <revision-id> [base|live]");
  console.log("  bun run cli revisions apply <document-id> <revision-id>");
  console.log("  bun run cli share list <document-id>");
  console.log("  bun run cli share grant <document-id> <email> <role>");
  console.log("  bun run cli share revoke <document-id> <user-id>");
};

const printCapabilities = () => {
  const grouped = listCapabilitiesByGroup();

  console.log("Capability Catalog");
  console.log("");

  for (const [group, capabilities] of Object.entries(grouped)) {
    console.log(group);
    for (const capability of capabilities) {
      console.log(`- ${capability.id} [${capability.surfaces.join(", ")}]`);
      console.log(`  ${capability.description}`);
    }
    console.log("");
  }

  console.log(`Total capabilities: ${capabilityCatalog.length}`);
};

const tryOpenBrowser = async (url: string) => {
  const candidates =
    process.platform === "darwin"
      ? [["open", url]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", "", url]]
        : [["xdg-open", url]];

  for (const commandParts of candidates) {
    try {
      const proc = Bun.spawn(commandParts, {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      await proc.exited;
      return;
    } catch {
      // Keep the printed URL as fallback.
    }
  }
};

const withTempMarkdownFile = async (name: string, initialMarkdown: string) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "sharemymarkdown-"));
  const tempFile = path.join(tmpDir, name);
  await writeFile(tempFile, initialMarkdown, "utf8");

  try {
    const editor = (process.env.EDITOR ?? "vi").split(" ").filter(Boolean);
    const proc = Bun.spawn([...editor, tempFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Editor exited with status ${exitCode}`);
    }

    return Bun.file(tempFile).text();
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

const authLogin = async () => {
  const result = await apiFetch<{
    id: string;
    url: string;
    expiresAt: string;
  }>("/api/cli-login/start", { method: "POST", body: "{}" }, false);

  console.log(`Open this URL to sign in: ${result.url}`);
  await tryOpenBrowser(result.url);
  console.log("Waiting for browser login...");

  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    await Bun.sleep(2000);

    const status = await apiFetch<{
      status: "pending" | "complete";
      token?: string;
    }>(`/api/cli-login/${result.id}`, undefined, false);

    if (status.status === "complete" && status.token) {
      await saveSessionToken(status.token);
      const session = await apiFetch<{
        user: { email: string; name: string } | null;
      }>("/api/session");
      console.log(`Signed in as ${session.user?.email ?? "unknown user"}`);
      return;
    }
  }

  throw new Error("Timed out waiting for browser login.");
};

const authStatus = async () => {
  const response = await apiFetch<{
    user: { id: string; email: string; name: string } | null;
    session: { id: string } | null;
  }>("/api/session");

  if (!response.user) {
    console.log("No active session");
    return;
  }

  console.log(`${response.user.name} <${response.user.email}>`);
  console.log(`Session: ${response.session?.id ?? "unknown"}`);
};

const authLogout = async () => {
  try {
    await apiFetch("/api/auth/sign-out", { method: "POST", body: "{}" });
  } catch {
    // Ignore server-side logout failures when cleaning local state.
  }

  await clearSessionToken();
  console.log("Logged out");
};

const listDocs = async () => {
  const documents = await apiFetch<Array<{ id: string; title: string; role: string; updatedAt: string }>>("/api/documents");
  if (documents.length === 0) {
    console.log("No documents");
    return;
  }

  for (const document of documents) {
    console.log(`${document.id}  ${document.title}  [${document.role}]  ${document.updatedAt}`);
  }
};

const createDoc = async (title: string) => {
  const document = await apiFetch<{ id: string; title: string }>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  console.log(`${document.id}  ${document.title}`);
};

const getDoc = async (documentId: string) => {
  const document = await apiFetch<{
    id: string;
    title: string;
    currentMarkdown: string;
    role: string;
    updatedAt: string;
  }>(`/api/documents/${documentId}`);

  console.log(`# ${document.title}`);
  console.log("");
  console.log(`role: ${document.role}`);
  console.log(`updated: ${document.updatedAt}`);
  console.log("");
  console.log(document.currentMarkdown);
};

const editDoc = async (documentId: string) => {
  const document = await apiFetch<{
    id: string;
    title: string;
    currentMarkdown: string;
  }>(`/api/documents/${documentId}`);

  const updatedMarkdown = await withTempMarkdownFile(`${document.id}.md`, document.currentMarkdown);
  await apiFetch(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ markdown: updatedMarkdown }),
  });
  console.log(`Saved ${document.title}`);
};

const listPresenceCli = async (documentId: string) => {
  const presence = await apiFetch<Array<{ userId: string; name: string; role: string; connections: number }>>(
    `/api/documents/${documentId}/presence`,
  );

  if (presence.length === 0) {
    console.log("No active collaborators");
    return;
  }

  for (const entry of presence) {
    console.log(`${entry.userId}  ${entry.name}  [${entry.role}]  ${entry.connections} connection${entry.connections === 1 ? "" : "s"}`);
  }
};

const listVersionsCli = async (documentId: string) => {
  const versions = await apiFetch<Array<{ id: string; message: string; createdAt: string; parentVersionId: string | null }>>(
    `/api/documents/${documentId}/versions`,
  );

  if (versions.length === 0) {
    console.log("No versions");
    return;
  }

  for (const version of versions) {
    console.log(`${version.id}  ${version.message}  ${version.createdAt}`);
  }
};

const saveVersionCli = async (documentId: string, message: string) => {
  const response = await apiFetch<{ versionId: string }>(`/api/documents/${documentId}/versions`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  console.log(`Saved version ${response.versionId}`);
};

const diffVersionsCli = async (documentId: string, fromVersionId: string, toVersionId: string) => {
  const response = await apiFetch<{ patch: string }>(
    `/api/documents/${documentId}/diff?from=${encodeURIComponent(fromVersionId)}&to=${encodeURIComponent(toVersionId)}`,
  );
  console.log(response.patch);
};

const restoreVersionCli = async (documentId: string, versionId: string) => {
  const response = await apiFetch<{ title: string }>(`/api/documents/${documentId}/restore/${versionId}`, {
    method: "POST",
  });
  console.log(`Restored ${response.title}`);
};

const listRevisionsCli = async (documentId: string) => {
  const revisions = await apiFetch<
    Array<{ id: string; title: string; status: "draft" | "review" | "applied"; authorId: string; updatedAt: string }>
  >(`/api/documents/${documentId}/revisions`);

  if (revisions.length === 0) {
    console.log("No revisions");
    return;
  }

  for (const revision of revisions) {
    console.log(`${revision.id}  ${revision.title}  [${revision.status}]  ${revision.updatedAt}`);
  }
};

const createRevisionCli = async (documentId: string, title: string) => {
  const revision = await apiFetch<{ id: string; title: string }>(`/api/documents/${documentId}/revisions`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  console.log(`Created revision ${revision.id}  ${revision.title}`);
};

const getRevisionCli = async (documentId: string, revisionId: string) => {
  const revision = await apiFetch<{
    id: string;
    title: string;
    description: string;
    status: "draft" | "review" | "applied";
    markdown: string;
    updatedAt: string;
  }>(`/api/documents/${documentId}/revisions/${revisionId}`);

  console.log(`# ${revision.title}`);
  console.log("");
  console.log(`status: ${revision.status}`);
  console.log(`updated: ${revision.updatedAt}`);
  if (revision.description) {
    console.log(`description: ${revision.description}`);
  }
  console.log("");
  console.log(revision.markdown);
};

const editRevisionCli = async (documentId: string, revisionId: string) => {
  const revision = await apiFetch<{
    id: string;
    title: string;
    markdown: string;
  }>(`/api/documents/${documentId}/revisions/${revisionId}`);

  const updatedMarkdown = await withTempMarkdownFile(`${revision.id}.revision.md`, revision.markdown);
  await apiFetch(`/api/documents/${documentId}/revisions/${revisionId}`, {
    method: "PATCH",
    body: JSON.stringify({ markdown: updatedMarkdown }),
  });
  console.log(`Saved revision ${revision.title}`);
};

const diffRevisionCli = async (documentId: string, revisionId: string, compareTo: "base" | "live") => {
  const response = await apiFetch<{ patch: string }>(
    `/api/documents/${documentId}/revisions/${revisionId}/diff?compare=${compareTo}`,
  );
  console.log(response.patch);
};

const applyRevisionCli = async (documentId: string, revisionId: string) => {
  const response = await apiFetch<{ title: string }>(`/api/documents/${documentId}/revisions/${revisionId}/apply`, {
    method: "POST",
  });
  console.log(`Applied revision to ${response.title}`);
};

const listMembersCli = async (documentId: string) => {
  const members = await apiFetch<Array<{ userId: string; name: string; email: string; role: string }>>(
    `/api/documents/${documentId}/members`,
  );

  for (const member of members) {
    console.log(`${member.userId}  ${member.email}  [${member.role}]  ${member.name}`);
  }
};

const grantCli = async (documentId: string, email: string, role: "editor" | "viewer") => {
  await apiFetch(`/api/documents/${documentId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  console.log(`Granted ${role} to ${email}`);
};

const revokeCli = async (documentId: string, userId: string) => {
  await apiFetch(`/api/documents/${documentId}/members/${userId}`, {
    method: "DELETE",
  });
  console.log(`Revoked access for ${userId}`);
};

const run = async () => {
  switch (command) {
    case "help": {
      printHelp();
      return;
    }
    case "status": {
      printHelp();
      console.log("");
      envStatus();
      console.log("");
      console.log(`Capabilities tracked: ${capabilityCatalog.length}`);
      return;
    }
    case "capabilities": {
      printCapabilities();
      return;
    }
    case "auth": {
      if (subcommand === "login") return authLogin();
      if (subcommand === "status") return authStatus();
      if (subcommand === "logout") return authLogout();
      break;
    }
    case "docs": {
      if (subcommand === "list") return listDocs();
      if (subcommand === "create") return createDoc(args.slice(2).join(" "));
      if (subcommand === "get" && args[2]) return getDoc(args[2]);
      if (subcommand === "edit" && args[2]) return editDoc(args[2]);
      if (subcommand === "presence" && args[2]) return listPresenceCli(args[2]);
      break;
    }
    case "versions": {
      if (subcommand === "list" && args[2]) return listVersionsCli(args[2]);
      if (subcommand === "save" && args[2]) return saveVersionCli(args[2], args.slice(3).join(" "));
      if (subcommand === "diff" && args[2] && args[3] && args[4]) return diffVersionsCli(args[2], args[3], args[4]);
      if (subcommand === "restore" && args[2] && args[3]) return restoreVersionCli(args[2], args[3]);
      break;
    }
    case "revisions": {
      if (subcommand === "list" && args[2]) return listRevisionsCli(args[2]);
      if (subcommand === "create" && args[2]) return createRevisionCli(args[2], args.slice(3).join(" "));
      if (subcommand === "get" && args[2] && args[3]) return getRevisionCli(args[2], args[3]);
      if (subcommand === "edit" && args[2] && args[3]) return editRevisionCli(args[2], args[3]);
      if (subcommand === "diff" && args[2] && args[3]) {
        const compareTo = args[4] === "base" ? "base" : "live";
        return diffRevisionCli(args[2], args[3], compareTo);
      }
      if (subcommand === "apply" && args[2] && args[3]) return applyRevisionCli(args[2], args[3]);
      break;
    }
    case "share": {
      if (subcommand === "list" && args[2]) return listMembersCli(args[2]);
      if (subcommand === "grant" && args[2] && args[3] && (args[4] === "editor" || args[4] === "viewer")) {
        return grantCli(args[2], args[3], args[4]);
      }
      if (subcommand === "revoke" && args[2] && args[3]) return revokeCli(args[2], args[3]);
      break;
    }
  }

  console.error("Unknown command");
  console.error("");
  printHelp();
  process.exitCode = 1;
};

await run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
