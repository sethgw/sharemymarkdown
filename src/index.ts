import { serve } from "bun";

import { documentVisibilityValues, isDocumentVisibility, type DocumentVisibility } from "@/shared/document-visibility";
import { auth } from "@/server/auth";
import {
  attachCollaborationSocket,
  createCollaborationUser,
  detachCollaborationSocket,
  handleCollaborationMessage,
  listDocumentPresence,
  type CollaborationSocketData,
} from "@/server/collaboration";
import { ensureDatabase } from "@/server/db/ensure";
import { env, githubConfigured } from "@/server/env";
import { handleMcpDiscovery, handleMcpLogin, handleMcpProtectedResource, handleMcpRequest } from "@/server/mcp";
import {
  markdown,
  renderDiffMarkdown,
  renderDocumentMarkdown,
  renderDocumentsMarkdown,
  renderMembersMarkdown,
  renderPresenceMarkdown,
  renderRevisionMarkdown,
  renderRevisionsMarkdown,
  renderVersionsMarkdown,
  wantsMarkdown,
} from "@/server/representations";
import { getSessionFromRequest, requireSession } from "@/server/session";
import {
  createDocument,
  createVersion,
  diffVersions,
  ensureAccess,
  getDocument,
  getSharedDocument,
  grantMember,
  listDocuments,
  listMembers,
  listVersions,
  restoreVersion,
  revokeMember,
  updateDocument,
} from "@/server/services/documents";
import { completeCliLogin, consumeCliLogin, startCliLogin } from "@/server/services/cli-login";
import {
  applyRevision,
  createRevision,
  diffRevision,
  getRevision,
  listRevisions,
  updateRevision,
} from "@/server/services/revisions";
import { isProduction } from "@/server/env";
import index from "./index.html";

await ensureDatabase();

const llmsFile = Bun.file(new URL("../llms.txt", import.meta.url));
const openapiFile = Bun.file(new URL("../openapi.yaml", import.meta.url));
const distDir = new URL("../dist", import.meta.url).pathname;

const serveDistFile = (pathname: string) => {
  const file = Bun.file(`${distDir}${pathname}`);
  return new Response(file);
};

const serveIndex = () => {
  if (isProduction) {
    return new Response(Bun.file(`${distDir}/index.html`), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return undefined;
};

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const readJson = async <T>(request: Request) => {
  return (await request.json()) as T;
};

const getBaseUrl = (request: Request) => {
  return new URL(request.url).origin;
};

const parseVisibility = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  return isDocumentVisibility(value) ? value : null;
};

const withShareUrl = <T extends { sharePath?: string | null }>(request: Request, value: T): T & { shareUrl?: string } => ({
  ...value,
  ...(value.sharePath ? { shareUrl: new URL(value.sharePath, getBaseUrl(request)).toString() } : {}),
});

const represent = (request: Request, url: URL, data: unknown, markdownBody: string, init?: ResponseInit) =>
  wantsMarkdown(request, url) ? markdown(markdownBody, init) : json(data, init);

const handleGitHubLogin = async (request: Request) => {
  if (!githubConfigured) {
    return new Response("GitHub auth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.", {
      status: 503,
    });
  }

  const url = new URL(request.url);
  const callbackURL = url.searchParams.get("callback") ?? "/";
  const socialHeaders = new Headers(request.headers);
  socialHeaders.set("content-type", "application/json");
  const socialRequest = new Request(new URL("/api/auth/sign-in/social", request.url), {
    method: "POST",
    headers: socialHeaders,
    body: JSON.stringify({ provider: "github", callbackURL }),
  });

  const response = await auth.handler(socialRequest);
  const redirectUrl = response.headers.get("location");

  if (!redirectUrl) {
    return json({ error: "Unable to start GitHub login" }, { status: 500 });
  }

  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  headers.set("location", redirectUrl);
  return new Response(null, { status: 302, headers });
};

const handleSignOut = async (request: Request) => {
  const callbackURL = new URL(request.url).searchParams.get("callback") ?? "/";
  const signOutRequest = new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers: request.headers,
  });

  const response = await auth.handler(signOutRequest);
  const headers = new Headers(response.headers);
  headers.set("location", callbackURL);
  return new Response(null, {
    status: 302,
    headers,
  });
};

const server = serve<CollaborationSocketData>({
  port: env.port,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
  websocket: {
    open(ws) {
      void attachCollaborationSocket(ws).catch(error => {
        console.error(error);
        ws.close(1011, "Unable to join collaboration room");
      });
    },
    message(ws, message) {
      void handleCollaborationMessage(ws, message).catch(error => {
        console.error(error);
        ws.close(1011, "Collaboration error");
      });
    },
    close(ws) {
      void detachCollaborationSocket(ws).catch(error => {
        console.error(error);
      });
    },
  },
  routes: isProduction ? {} : {
    "/": index,
    "/dashboard": index,
    "/documents/*": index,
    "/cli/login": index,
    "/d/*": index,
  },
  async fetch(request, server) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (isProduction && (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".svg") || pathname.endsWith(".map"))) {
        return serveDistFile(pathname);
      }

      if (pathname.startsWith("/api/collab/")) {
        const segments = pathname.split("/").filter(Boolean);
        const documentId = segments[2];

        if (!documentId) {
          return json({ error: "Missing document id" }, { status: 400 });
        }

        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response("Expected websocket upgrade", { status: 426 });
        }

        const session = await requireSession(request);
        const membership = await ensureAccess(session.user.id, documentId, "read");
        const upgraded = server.upgrade(request, {
          data: {
            documentId,
            awarenessClientId: null,
            user: createCollaborationUser({
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              role: membership.role,
            }),
          },
        });

        if (!upgraded) {
          return json({ error: "Unable to start collaboration session" }, { status: 400 });
        }

        return;
      }

      if (pathname.startsWith("/api/auth")) {
        return auth.handler(request);
      }

      if (pathname === "/auth/github") {
        return handleGitHubLogin(request);
      }

      if (pathname === "/auth/signout") {
        return handleSignOut(request);
      }

      if (pathname === "/llms.txt" || pathname === "/.well-known/llms.txt") {
        return markdown(await llmsFile.text(), {
          status: 200,
          headers: {
            "cache-control": "public, max-age=300",
          },
        });
      }

      if (pathname === "/.well-known/agents.json") {
        return json({
          name: "ShareMyMarkdown",
          description: "CLI-first collaborative Markdown with realtime editing, versions, revisions, and sharing.",
          url: getBaseUrl(request),
          cli: {
            package: "@sharemymarkdown/smm",
            install: "bun add -g @sharemymarkdown/smm",
            binary: "smm",
          },
          capabilities: {
            mcp: {
              endpoint: `${getBaseUrl(request)}/mcp`,
              discovery: `${getBaseUrl(request)}/.well-known/oauth-authorization-server`,
            },
            api: {
              base: `${getBaseUrl(request)}/api`,
              auth: "bearer",
              markdown_representations: true,
              accept_header: "text/markdown",
              query_param: "format=md",
            },
            collaboration: {
              protocol: "yjs",
              transport: "websocket",
              endpoint: `${getBaseUrl(request)}/api/collab`,
            },
          },
          discovery: {
            llms_txt: `${getBaseUrl(request)}/llms.txt`,
            openapi: `${getBaseUrl(request)}/openapi.yaml`,
            agents_md: "https://github.com/sethgw/sharemymarkdown/blob/master/AGENTS.md",
            architecture: "https://github.com/sethgw/sharemymarkdown/blob/master/docs/architecture.md",
          },
        }, {
          headers: {
            "cache-control": "public, max-age=300",
          },
        });
      }

      if (pathname === "/mcp/login") {
        return handleMcpLogin(request);
      }

      if (pathname === "/mcp") {
        return handleMcpRequest(request);
      }

      if (pathname === "/.well-known/oauth-authorization-server") {
        return handleMcpDiscovery(request);
      }

      if (pathname === "/.well-known/oauth-protected-resource") {
        return handleMcpProtectedResource(request);
      }

      if (pathname === "/api/openapi.yaml" || pathname === "/openapi.yaml") {
        return new Response(openapiFile, {
          headers: {
            "content-type": "text/yaml; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      }

      if (pathname === "/api/health") {
        return json({
          ok: true,
          githubConfigured,
          databaseUrl: env.databaseUrl.startsWith("libsql://") ? "turso" : env.databaseUrl,
        });
      }

      if (pathname === "/api/session") {
        const session = await getSessionFromRequest(request);
        return json({
          session: session?.session ?? null,
          user: session?.user ?? null,
          githubConfigured,
          appUrl: env.appUrl,
        });
      }

      if (pathname === "/api/cli-login/start" && request.method === "POST") {
        const loginRequest = await startCliLogin();
        return json({
          id: loginRequest.id,
          expiresAt: loginRequest.expiresAt,
          url: `${getBaseUrl(request)}/cli/login?requestId=${loginRequest.id}`,
        });
      }

      if (pathname.startsWith("/api/cli-login/")) {
        const segments = pathname.split("/").filter(Boolean);
        const requestId = segments[2];

        if (!requestId) {
          return json({ error: "Missing login request id" }, { status: 400 });
        }

        if (segments.length === 3 && request.method === "GET") {
          const status = await consumeCliLogin(requestId);
          return json(status);
        }

        if (segments.length === 4 && segments[3] === "complete" && request.method === "POST") {
          const session = await requireSession(request);
          await completeCliLogin(requestId, session.user.id, session.session.token);
          return json({
            ok: true,
            user: session.user,
          });
        }
      }

      if (pathname === "/api/documents") {
        const session = await requireSession(request);

        if (request.method === "GET") {
          const documents = (await listDocuments(session.user.id)).map(document => withShareUrl(request, document));
          return represent(request, url, documents, renderDocumentsMarkdown(documents));
        }

        if (request.method === "POST") {
          const body = await readJson<{ title?: string; markdown?: string; visibility?: string; sourcePath?: string }>(request);
          const visibility = parseVisibility(body.visibility);

          if (body.visibility && visibility === null) {
            return json({ error: `Visibility must be one of: ${documentVisibilityValues.join(", ")}` }, { status: 400 });
          }

          const documentId = await createDocument(session.user.id, body.title ?? "", {
            markdown: body.markdown,
            visibility: visibility ?? undefined,
            sourcePath: body.sourcePath,
          });
          return json(withShareUrl(request, await getDocument(session.user.id, documentId)), { status: 201 });
        }
      }

      if (pathname.startsWith("/api/shared/")) {
        const segments = pathname.split("/").filter(Boolean);
        const shareId = segments[2];

        if (!shareId) {
          return json({ error: "Missing share id" }, { status: 400 });
        }

        if (segments.length === 3 && request.method === "GET") {
          const session = await getSessionFromRequest(request);
          const document = withShareUrl(request, await getSharedDocument(shareId, session?.user.id ?? null));
          return represent(request, url, document, renderDocumentMarkdown(document));
        }
      }

      if (pathname.startsWith("/api/documents/")) {
        const session = await requireSession(request);
        const segments = pathname.split("/").filter(Boolean);
        const documentId = segments[2];

        if (!documentId) {
          return json({ error: "Missing document id" }, { status: 400 });
        }

        if (segments.length === 3) {
          if (request.method === "GET") {
            const document = withShareUrl(request, await getDocument(session.user.id, documentId));
            return represent(request, url, document, renderDocumentMarkdown(document));
          }

          if (request.method === "PATCH") {
            const body = await readJson<{ title?: string; markdown?: string; visibility?: string }>(request);
            const visibility = parseVisibility(body.visibility);

            if (body.visibility && visibility === null) {
              return json({ error: `Visibility must be one of: ${documentVisibilityValues.join(", ")}` }, { status: 400 });
            }

            return json(
              withShareUrl(
                request,
                await updateDocument(session.user.id, documentId, {
                  ...body,
                  visibility: visibility ?? undefined,
                }),
              ),
            );
          }
        }

        if (segments.length === 4 && segments[3] === "presence" && request.method === "GET") {
          await ensureAccess(session.user.id, documentId, "read");
          const presence = await listDocumentPresence(documentId);
          return represent(request, url, presence, renderPresenceMarkdown(documentId, presence));
        }

        if (segments.length === 4 && segments[3] === "versions") {
          if (request.method === "GET") {
            const versions = await listVersions(session.user.id, documentId);
            return represent(request, url, versions, renderVersionsMarkdown(documentId, versions));
          }

          if (request.method === "POST") {
            const body = await readJson<{ message?: string }>(request);
            const versionId = await createVersion(session.user.id, documentId, body.message ?? "");
            return json({ versionId }, { status: 201 });
          }
        }

        if (segments.length === 4 && segments[3] === "revisions") {
          if (request.method === "GET") {
            const revisions = await listRevisions(session.user.id, documentId);
            return represent(request, url, revisions, renderRevisionsMarkdown(documentId, revisions));
          }

          if (request.method === "POST") {
            const body = await readJson<{ title?: string; description?: string; markdown?: string }>(request);
            return json(await createRevision(session.user.id, documentId, body), { status: 201 });
          }
        }

        if (segments.length === 5 && segments[3] === "revisions") {
          const revisionId = segments[4];

          if (request.method === "GET") {
            const revision = await getRevision(session.user.id, documentId, revisionId);
            return represent(request, url, revision, renderRevisionMarkdown(revision));
          }

          if (request.method === "PATCH") {
            const body = await readJson<{
              title?: string;
              description?: string;
              markdown?: string;
              status?: "draft" | "review";
            }>(request);
            return json(await updateRevision(session.user.id, documentId, revisionId, body));
          }
        }

        if (segments.length === 6 && segments[3] === "revisions" && segments[5] === "diff" && request.method === "GET") {
          const compareTo = url.searchParams.get("compare") === "base" ? "base" : "live";
          const diff = await diffRevision(session.user.id, documentId, segments[4], compareTo);
          return represent(request, url, diff, renderDiffMarkdown(`Revision Diff (${compareTo})`, diff.patch));
        }

        if (segments.length === 6 && segments[3] === "revisions" && segments[5] === "apply" && request.method === "POST") {
          return json(withShareUrl(request, await applyRevision(session.user.id, documentId, segments[4])));
        }

        if (segments.length === 4 && segments[3] === "diff" && request.method === "GET") {
          const fromVersionId = url.searchParams.get("from");
          const toVersionId = url.searchParams.get("to");

          if (!fromVersionId || !toVersionId) {
            return json({ error: "Both from and to version ids are required" }, { status: 400 });
          }

          const diff = await diffVersions(session.user.id, documentId, fromVersionId, toVersionId);
          return represent(request, url, diff, renderDiffMarkdown("Version Diff", diff.patch));
        }

        if (segments.length === 5 && segments[3] === "restore" && request.method === "POST") {
          return json(withShareUrl(request, await restoreVersion(session.user.id, documentId, segments[4])));
        }

        if (segments.length === 4 && segments[3] === "members") {
          if (request.method === "GET") {
            const members = await listMembers(session.user.id, documentId);
            return represent(request, url, members, renderMembersMarkdown(documentId, members));
          }

          if (request.method === "POST") {
            const body = await readJson<{ email: string; role: "editor" | "viewer" }>(request);
            return json(await grantMember(session.user.id, documentId, body.email, body.role));
          }
        }

        if (segments.length === 5 && segments[3] === "members" && request.method === "DELETE") {
          return json(await revokeMember(session.user.id, documentId, segments[4]));
        }
      }

      // Inject OG meta tags for shared document links (link previews in messaging apps)
      if (pathname.startsWith("/d/")) {
        const shareId = pathname.split("/")[2];
        if (shareId) {
          try {
            const doc = await getSharedDocument(shareId, null);
            const description = (doc.currentMarkdown ?? "").slice(0, 200).replace(/[#*_`\n\r]+/g, " ").trim();
            const baseUrl = getBaseUrl(request);
            const indexHtml = isProduction
              ? await Bun.file(`${distDir}/index.html`).text()
              : await Bun.file(new URL("./index.html", import.meta.url)).text();
            const ogTags = [
              `<meta property="og:title" content="${doc.title.replace(/"/g, "&quot;")}" />`,
              `<meta property="og:description" content="${description.replace(/"/g, "&quot;")}" />`,
              `<meta property="og:type" content="article" />`,
              `<meta property="og:url" content="${baseUrl}/d/${shareId}" />`,
              `<meta property="og:site_name" content="ShareMyMarkdown" />`,
              `<meta name="twitter:card" content="summary" />`,
              `<meta name="twitter:title" content="${doc.title.replace(/"/g, "&quot;")}" />`,
              `<meta name="twitter:description" content="${description.replace(/"/g, "&quot;")}" />`,
              `<title>${doc.title.replace(/</g, "&lt;")} - ShareMyMarkdown</title>`,
            ].join("\n    ");
            const html = indexHtml.replace("<title>ShareMyMarkdown</title>", ogTags);
            return new Response(html, {
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          } catch {
            // document not found or private — fall through to normal index
          }
        }
      }

      if (isProduction && !pathname.startsWith("/api/")) {
        return serveIndex()!;
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error(error);
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
});

console.log(`ShareMyMarkdown running at ${server.url}`);
