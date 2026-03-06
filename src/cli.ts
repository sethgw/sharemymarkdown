#!/usr/bin/env bun
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { capabilityCatalog, listCapabilitiesByGroup, primarySurface } from "@/core/capabilities";
import {
  apiFetch,
  clearSessionToken,
  localClientConfig,
  readLocalCliConfig,
  saveLocalCliConfig,
  saveSessionToken,
} from "@/local/client";
import { documentVisibilityValues, type DocumentVisibility } from "@/shared/document-visibility";

type ParsedCliArgs = {
  positionals: string[];
  options: Record<string, string | boolean>;
};

type DocumentSummary = {
  id: string;
  title: string;
  role: string;
  updatedAt: string;
  visibility: DocumentVisibility;
  shareId: string;
  sharePath: string;
  shareUrl?: string;
};

type DocumentDetail = {
  id: string;
  title: string;
  role: "owner" | "editor" | "viewer";
  currentMarkdown: string;
  updatedAt: string;
  ownerId: string;
  visibility: DocumentVisibility;
  shareId: string;
  sharePath: string;
  sourcePath: string | null;
  shareUrl?: string;
};

const args = Bun.argv.slice(2);
const command = args[0] ?? "share";
const subcommand = args[1];
const serverUrl = localClientConfig.serverUrl;
const visibilityValues = new Set<string>(documentVisibilityValues);
const productCommand = "smm";
const aliasCommand = "sharemymarkdown";

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
    ["SMM_SERVER_URL", Boolean(process.env.SMM_SERVER_URL)],
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
  console.log(`Binary: ${productCommand} (alias: ${aliasCommand})`);
  console.log(`Server URL: ${serverUrl}`);
  console.log("");
  console.log("Core flow:");
  console.log(`  ${productCommand} share draft.md --visibility unlisted`);
  console.log(`  cat draft.md | ${aliasCommand} share --title "Working Draft"`);
  console.log(`  ${productCommand}`);
  console.log("");
  console.log("Usage:");
  console.log(`  ${productCommand} help`);
  console.log(`  ${productCommand} status`);
  console.log(`  ${productCommand} capabilities`);
  console.log(`  ${productCommand} auth login`);
  console.log(`  ${productCommand} auth status`);
  console.log(`  ${productCommand} auth logout`);
  console.log(`  ${productCommand} share [file] [--title <title>] [--visibility <private|unlisted|public>] [--open] [--json]`);
  console.log(`  ${productCommand} docs list`);
  console.log(`  ${productCommand} docs create [title] [--visibility <private|unlisted|public>]`);
  console.log(`  ${productCommand} docs get <document-id>`);
  console.log(`  ${productCommand} docs edit <document-id>`);
  console.log(`  ${productCommand} docs presence <document-id>`);
  console.log(`  ${productCommand} docs visibility <document-id> <private|unlisted|public>`);
  console.log(`  ${productCommand} versions list <document-id>`);
  console.log(`  ${productCommand} versions save <document-id> <message>`);
  console.log(`  ${productCommand} versions diff <document-id> <from-version-id> <to-version-id>`);
  console.log(`  ${productCommand} versions restore <document-id> <version-id>`);
  console.log(`  ${productCommand} revisions list <document-id>`);
  console.log(`  ${productCommand} revisions create <document-id> <title>`);
  console.log(`  ${productCommand} revisions get <document-id> <revision-id>`);
  console.log(`  ${productCommand} revisions edit <document-id> <revision-id>`);
  console.log(`  ${productCommand} revisions diff <document-id> <revision-id> [base|live]`);
  console.log(`  ${productCommand} revisions apply <document-id> <revision-id>`);
  console.log(`  ${productCommand} members list <document-id>`);
  console.log(`  ${productCommand} members grant <document-id> <email> <role>`);
  console.log(`  ${productCommand} members revoke <document-id> <user-id>`);
  console.log(`  ${productCommand} config show`);
  console.log(`  ${productCommand} config set default-visibility <private|unlisted|public>`);
  console.log(`  ${productCommand} open <share-url-or-id>`);
  console.log(`  ${productCommand} watch <document-id>`);
  console.log(`  ${productCommand} install-skill`);
  console.log("");
  console.log("Pipe into Claude Code:");
  console.log(`  ${productCommand} open <share-url> | claude`);
  console.log("");
  console.log("Round-trip (share, let someone edit, pull changes back):");
  console.log(`  ${productCommand} share plan.md --json        # note the id`);
  console.log(`  ${productCommand} watch <id>                  # blocks until edited, prints new markdown`);
  console.log("");
  console.log("Developer shortcut:");
  console.log("  bun run cli -- <command>");
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

const parseCliArgs = (input: string[]): ParsedCliArgs => {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];

    if (!value) {
      continue;
    }

    if (value.startsWith("--")) {
      const [rawKey, inlineValue] = value.slice(2).split("=", 2);

      if (inlineValue !== undefined) {
        options[rawKey] = inlineValue;
        continue;
      }

      const nextValue = input[index + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        options[rawKey] = nextValue;
        index += 1;
      } else {
        options[rawKey] = true;
      }
      continue;
    }

    if (value.startsWith("-") && value.length > 1) {
      const shortFlags = value.slice(1).split("");
      const lastFlag = shortFlags.at(-1);

      for (const flag of shortFlags) {
        options[flag] = true;
      }

      const nextValue = input[index + 1];
      if (lastFlag && nextValue && !nextValue.startsWith("-") && ["t", "v"].includes(lastFlag)) {
        options[lastFlag] = nextValue;
        index += 1;
      }
      continue;
    }

    positionals.push(value);
  }

  return { positionals, options };
};

const getOptionString = (parsed: ParsedCliArgs, names: string[]) => {
  for (const name of names) {
    const value = parsed.options[name];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
};

const hasOption = (parsed: ParsedCliArgs, names: string[]) => {
  return names.some(name => parsed.options[name] === true);
};

const parseVisibility = (value: string | undefined, fallback: DocumentVisibility = "private"): DocumentVisibility => {
  if (!value) {
    return fallback;
  }

  if (!visibilityValues.has(value)) {
    throw new Error(`Visibility must be one of: ${documentVisibilityValues.join(", ")}`);
  }

  return value as DocumentVisibility;
};

const formatShareUrl = (document: { shareUrl?: string; sharePath: string }) =>
  document.shareUrl ?? new URL(document.sharePath, serverUrl).toString();

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

const readPipedStdin = async () => {
  if (process.stdin.isTTY) {
    return null;
  }

  return new Response(Bun.stdin.stream()).text();
};

const deriveTitle = (explicitTitle: string | undefined, sourcePath: string | undefined, markdown: string) => {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  if (sourcePath) {
    return path.basename(sourcePath).replace(/\.[^.]+$/, "");
  }

  return "Shared draft";
};

const loadMarkdownInput = async (sourcePath: string | undefined) => {
  if (sourcePath) {
    const file = Bun.file(sourcePath);
    if (!(await file.exists())) {
      throw new Error(`No such file: ${sourcePath}`);
    }

    return file.text();
  }

  const piped = await readPipedStdin();
  if (piped !== null) {
    return piped;
  }

  return withTempMarkdownFile("shared-draft.md", "");
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
  const documents = await apiFetch<DocumentSummary[]>("/api/documents");
  if (documents.length === 0) {
    console.log("No documents");
    return;
  }

  for (const document of documents) {
    console.log(
      `${document.id}  ${document.title}  [${document.role}/${document.visibility}]  ${document.updatedAt}  ${formatShareUrl(document)}`,
    );
  }
};

const createDoc = async (input: string[]) => {
  const parsed = parseCliArgs(input);
  const config = await readLocalCliConfig();
  const title = getOptionString(parsed, ["title", "t"]) ?? parsed.positionals.join(" ");
  const visibility = parseVisibility(getOptionString(parsed, ["visibility", "v"]), config.defaultVisibility ?? "unlisted");
  const document = await apiFetch<DocumentDetail>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ title, visibility }),
  });
  console.log(`${document.id}  ${document.title}  [${document.visibility}]  ${formatShareUrl(document)}`);
};

const getDoc = async (documentId: string) => {
  const document = await apiFetch<DocumentDetail>(`/api/documents/${documentId}`);

  console.log(`# ${document.title}`);
  console.log("");
  console.log(`role: ${document.role}`);
  console.log(`visibility: ${document.visibility}`);
  console.log(`share: ${formatShareUrl(document)}`);
  console.log(`updated: ${document.updatedAt}`);
  console.log("");
  console.log(document.currentMarkdown);
};

const editDoc = async (documentId: string) => {
  const document = await apiFetch<DocumentDetail>(`/api/documents/${documentId}`);

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

const setDocVisibilityCli = async (documentId: string, visibility: string) => {
  const document = await apiFetch<DocumentDetail>(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ visibility: parseVisibility(visibility) }),
  });
  console.log(`${document.title}  [${document.visibility}]  ${formatShareUrl(document)}`);
};

const shareDocumentCli = async (input: string[]) => {
  const parsed = parseCliArgs(input);
  const sourcePath = parsed.positionals[0];
  const config = await readLocalCliConfig();
  const visibility = parseVisibility(getOptionString(parsed, ["visibility", "v"]), config.defaultVisibility ?? "unlisted");
  const markdown = await loadMarkdownInput(sourcePath);
  const title = deriveTitle(getOptionString(parsed, ["title", "t"]), sourcePath, markdown);
  const relativePath = sourcePath ? path.relative(process.cwd(), path.resolve(sourcePath)) : undefined;
  const document = await apiFetch<DocumentDetail>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ title, markdown, visibility, sourcePath: relativePath }),
  });
  const shareUrl = formatShareUrl(document);

  if (hasOption(parsed, ["json", "j"])) {
    console.log(
      JSON.stringify(
        {
          id: document.id,
          title: document.title,
          role: document.role,
          visibility: document.visibility,
          shareId: document.shareId,
          sharePath: document.sharePath,
          sourcePath: document.sourcePath,
          shareUrl,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(shareUrl);
  }

  if (hasOption(parsed, ["open", "o"])) {
    await tryOpenBrowser(shareUrl);
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
  const response = await apiFetch<DocumentDetail>(`/api/documents/${documentId}/restore/${versionId}`, {
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

  if (members.length === 0) {
    console.log("No members");
    return;
  }

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

const runMemberCommand = async (input: string[]) => {
  const memberSubcommand = input[0];

  if (memberSubcommand === "list" && input[1]) {
    return listMembersCli(input[1]);
  }

  if (memberSubcommand === "grant" && input[1] && input[2] && (input[3] === "editor" || input[3] === "viewer")) {
    return grantCli(input[1], input[2], input[3]);
  }

  if (memberSubcommand === "revoke" && input[1] && input[2]) {
    return revokeCli(input[1], input[2]);
  }

  throw new Error("Unknown members command");
};

const SKILL_CONTENT = `# /smm - Share My Markdown (markdown)

When the user wants to share something — a plan, draft, notes, summary, or any markdown — use \`smm\` to create a shareable link.

## How to use

1. Identify what to share: a file they mention, or markdown content from the conversation (a plan, summary, etc.)

2. File:
   \`\`\`bash
   smm share <file> --visibility unlisted
   \`\`\`

3. Conversation content:
   \`\`\`bash
   echo '<markdown>' | smm share --title "The Title" --visibility unlisted
   \`\`\`

4. Share with someone specific:
   \`\`\`bash
   smm members grant <document-id> user@example.com editor
   \`\`\`

5. Return the link and the document ID.

## Round-trip flow

Share a document, let someone edit it in the browser, then pull the changes back:

1. Share:
   \`\`\`bash
   smm share plan.md --visibility unlisted --json
   \`\`\`
   Save the \`id\` from the JSON output.

2. Give the user the share URL. They edit in the web editor.

3. Wait for changes:
   \`\`\`bash
   smm watch <document-id>
   \`\`\`
   This blocks until the document is modified, then prints the updated markdown.

4. Or pull the latest immediately:
   \`\`\`bash
   smm docs get <document-id>
   \`\`\`

## Auth

If auth error: \`smm auth login\`

## Install

If not found: \`bun add -g @sharemymarkdown/smm\`

## Visibility

- \`private\` — owner and granted members only
- \`unlisted\` — anyone with the link (default)
- \`public\` — discoverable

## Full command reference

\`\`\`bash
smm docs list
smm docs get <id>
smm docs edit <id>
smm watch <id>
smm open <share-url-or-id>
smm versions save <id> "message"
smm versions diff <id> <from> <to>
smm versions restore <id> <version-id>
smm revisions create <id> "title"
smm revisions edit <id> <revision-id>
smm revisions diff <id> <revision-id> [base|live]
smm revisions apply <id> <revision-id>
smm members list <id>
smm members grant <id> <email> <role>
smm members revoke <id> <user-id>
smm config show
smm config set default-visibility unlisted
\`\`\`
`;

const watchDoc = async (documentId: string) => {
  const initial = await apiFetch<DocumentDetail>(`/api/documents/${documentId}`);
  let lastMarkdown = initial.currentMarkdown;
  let lastUpdatedAt = initial.updatedAt;

  process.stderr.write(`Watching "${initial.title}" for changes... (Ctrl+C to stop)
`);

  while (true) {
    await Bun.sleep(2000);

    const current = await apiFetch<DocumentDetail>(`/api/documents/${documentId}`);
    if (current.updatedAt !== lastUpdatedAt || current.currentMarkdown !== lastMarkdown) {
      lastMarkdown = current.currentMarkdown;
      lastUpdatedAt = current.updatedAt;
      console.log(current.currentMarkdown);
      return;
    }
  }
};

const openSharedDoc = async (input: string) => {
  // Accept a full URL like https://sharemymarkdown.com/d/abc123 or just the shareId
  const shareId = input.replace(/.*\/d\//, "").replace(/[/?#].*$/, "");
  if (!shareId) {
    throw new Error("Usage: smm open <share-url-or-id>");
  }

  const document = await apiFetch<{ title: string; currentMarkdown: string }>(
    `/api/shared/${encodeURIComponent(shareId)}`,
    undefined,
    false,
  );

  console.log(document.currentMarkdown);
};

const installSkill = async () => {
  const claudeDir = path.join(os.homedir(), ".claude");
  const skillDir = path.join(claudeDir, "skills", "smm");
  const skillPath = path.join(skillDir, "SKILL.md");

  await mkdir(skillDir, { recursive: true });
  await writeFile(skillPath, SKILL_CONTENT, "utf8");

  console.log(`Installed /smm skill to ${skillPath}`);
  console.log("");
  console.log("Restart Claude Code to activate. Then use /smm to share markdown.");
};

const showConfig = async () => {
  const config = await readLocalCliConfig();
  console.log(
    JSON.stringify(
      {
        defaultVisibility: config.defaultVisibility ?? "private",
        serverUrl,
      },
      null,
      2,
    ),
  );
};

const setConfig = async (key: string | undefined, value: string | undefined) => {
  if (key !== "default-visibility") {
    throw new Error("Only `default-visibility` can be configured right now.");
  }

  const current = await readLocalCliConfig();
  const nextVisibility = parseVisibility(value);
  await saveLocalCliConfig({
    ...current,
    defaultVisibility: nextVisibility,
  });
  console.log(`default-visibility: ${nextVisibility}`);
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
    case "share": {
      if (subcommand === "list" || subcommand === "grant" || subcommand === "revoke") {
        return runMemberCommand(args.slice(1));
      }
      return shareDocumentCli(args.slice(1));
    }
    case "docs": {
      if (subcommand === "list") return listDocs();
      if (subcommand === "create") return createDoc(args.slice(2));
      if (subcommand === "get" && args[2]) return getDoc(args[2]);
      if (subcommand === "edit" && args[2]) return editDoc(args[2]);
      if (subcommand === "presence" && args[2]) return listPresenceCli(args[2]);
      if (subcommand === "visibility" && args[2] && args[3]) return setDocVisibilityCli(args[2], args[3]);
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
    case "members": {
      return runMemberCommand(args.slice(1));
    }
    case "config": {
      if (subcommand === "show") return showConfig();
      if (subcommand === "set") return setConfig(args[2], args[3]);
      break;
    }
    case "watch": {
      if (!subcommand) throw new Error("Usage: smm watch <document-id>");
      return watchDoc(subcommand);
    }
    case "open": {
      if (!subcommand) throw new Error("Usage: smm open <share-url-or-id>");
  console.log(`  ${productCommand} watch <document-id>`);
      return openSharedDoc(subcommand);
    }
    case "install-skill": {
      return installSkill();
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
