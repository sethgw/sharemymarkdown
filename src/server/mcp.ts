import { requireMcpAuth } from "@better-auth/mcp";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { JWTPayload } from "jose";

import { createAppMcpServer, createRemoteMcpBackend } from "@/mcp/server";
import { auth, mcpResource } from "@/server/auth";
import { env, githubConfigured } from "@/server/env";
import { getSessionFromRequest } from "@/server/session";

type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  extra: {
    userId: string;
  };
};

type ManagedSession = {
  server: ReturnType<typeof createAppMcpServer>;
  transport: WebStandardStreamableHTTPServerTransport;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Max-Age": "86400",
};

const managedSessions = new Map<string, ManagedSession>();

const jsonRpcError = (status: number, code: number, message: string) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code,
        message,
      },
      id: null,
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        ...corsHeaders,
      },
    },
  );

const toAuthInfo = (request: Request, claims: JWTPayload): AuthInfo => ({
  token: request.headers.get("authorization")?.replace(/^(Bearer|DPoP)\s+/i, "") ?? "",
  clientId: typeof claims.azp === "string" ? claims.azp : "",
  scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
  extra: {
    userId: claims.sub ?? "",
  },
});

const handleAuthorizedMcpRequest = requireMcpAuth(auth, async (request, claims) => {
  const parsedBody =
    request.method === "POST" ? await request.clone().json().catch(() => null) : undefined;
  const transportSessionId = request.headers.get("mcp-session-id");

  let managed = transportSessionId ? managedSessions.get(transportSessionId) : undefined;

  if (!managed) {
    if (transportSessionId) {
      return jsonRpcError(404, -32001, "Session not found");
    }

    if (request.method !== "POST" || !parsedBody || !isInitializeRequest(parsedBody)) {
      return jsonRpcError(400, -32000, "Bad Request: No valid session ID provided");
    }

    let server!: ReturnType<typeof createAppMcpServer>;
    let transport!: WebStandardStreamableHTTPServerTransport;

    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized(sessionId) {
        managedSessions.set(sessionId, { server, transport });
      },
      onsessionclosed(sessionId) {
        managedSessions.delete(sessionId);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        managedSessions.delete(transport.sessionId);
      }
    };

    server = createAppMcpServer(createRemoteMcpBackend);
    await server.connect(transport);
    managed = { server, transport };
  }

  const response = await managed.transport.handleRequest(request, {
    parsedBody,
    authInfo: toAuthInfo(request, claims),
  });

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}, {
  resource: mcpResource,
  // Read the signing keys from this process instead of a round trip through the public origin.
  jwksUrl: `http://127.0.0.1:${env.port}/api/auth/jwks`,
});

const discoveryHandler = oauthProviderAuthServerMetadata(auth);

// Signed parameters the OAuth provider appends to login and consent page URLs.
const signedQueryParams = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const handleMcpRequest = async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return handleAuthorizedMcpRequest(request);
};

export const handleMcpDiscovery = (request: Request) => {
  return discoveryHandler(request);
};

// The mcp() plugin serves RFC 9728 protected resource metadata from its request hook.
export const handleMcpProtectedResource = (request: Request) => {
  return auth.handler(request);
};

const redirectToSignIn = (request: Request, url: URL) => {
  const signInUrl = new URL("/auth/github", request.url);
  signInUrl.searchParams.set("callback", `${url.pathname}${url.search}`);
  return Response.redirect(signInUrl.toString(), 302);
};

export const handleMcpLogin = async (request: Request) => {
  if (!githubConfigured) {
    return new Response("GitHub auth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.", {
      status: 503,
    });
  }

  const url = new URL(request.url);
  const session = await getSessionFromRequest(request);

  if (!session?.user) {
    return redirectToSignIn(request, url);
  }

  // Signed in: restart the authorization request, which now finds the session.
  const authorizeUrl = new URL("/api/auth/oauth2/authorize", request.url);
  authorizeUrl.search = url.search;
  for (const param of signedQueryParams) {
    authorizeUrl.searchParams.delete(param);
  }
  const prompts = (authorizeUrl.searchParams.get("prompt") ?? "").split(" ").filter(prompt => prompt && prompt !== "login");
  if (prompts.length > 0) {
    authorizeUrl.searchParams.set("prompt", prompts.join(" "));
  } else {
    authorizeUrl.searchParams.delete("prompt");
  }

  return Response.redirect(authorizeUrl.toString(), 302);
};

const renderConsentPage = (input: { clientName: string; clientUri?: string; scopes: string[]; oauthQuery: string; userEmail: string }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${escapeHtml(input.clientName)} - ShareMyMarkdown</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; display: grid; place-items: center; min-height: 100vh; }
  main { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; max-width: 420px; width: calc(100% - 32px); box-sizing: border-box; }
  h1 { font-size: 1.25rem; margin: 0 0 12px; }
  p, li { line-height: 1.5; }
  .muted { color: #475569; font-size: 0.9rem; }
  .actions { display: flex; gap: 12px; margin-top: 24px; }
  button { flex: 1; font: inherit; padding: 10px 16px; border-radius: 8px; border: 1px solid #0f172a; cursor: pointer; }
  button[value="true"] { background: #0f172a; color: #fff; }
  button[value="false"] { background: #fff; color: #0f172a; }
</style>
</head>
<body>
<main>
  <h1>Authorize ${escapeHtml(input.clientName)}</h1>
  <p><strong>${escapeHtml(input.clientName)}</strong> wants to use your ShareMyMarkdown account (${escapeHtml(input.userEmail)}) through MCP.</p>
  ${input.clientUri ? `<p class="muted">${escapeHtml(input.clientUri)}</p>` : ""}
  ${input.scopes.length > 0 ? `<p>Requested scopes:</p><ul>${input.scopes.map(scope => `<li><code>${escapeHtml(scope)}</code></li>`).join("")}</ul>` : ""}
  <form method="post" action="/mcp/consent">
    <input type="hidden" name="oauth_query" value="${escapeHtml(input.oauthQuery)}">
    <div class="actions">
      <button type="submit" name="accept" value="false">Deny</button>
      <button type="submit" name="accept" value="true">Allow</button>
    </div>
  </form>
</main>
</body>
</html>`;

export const handleMcpConsent = async (request: Request) => {
  if (request.method === "POST") {
    const form = await request.formData();
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");

    // Forward the browser's cookies and Origin so Better Auth's session and origin checks apply.
    const consentResponse = await auth.handler(
      new Request(new URL("/api/auth/oauth2/consent", request.url), {
        method: "POST",
        headers,
        body: JSON.stringify({
          accept: form.get("accept") === "true",
          oauth_query: String(form.get("oauth_query") ?? ""),
        }),
      }),
    );
    const payload = (await consentResponse.json().catch(() => null)) as { url?: string } | null;

    if (!consentResponse.ok || !payload?.url) {
      return new Response("Unable to complete MCP authorization. Start the connection again from your MCP client.", {
        status: consentResponse.ok ? 400 : consentResponse.status,
      });
    }

    return Response.redirect(new URL(payload.url, request.url).toString(), 302);
  }

  const url = new URL(request.url);
  const session = await getSessionFromRequest(request);

  if (!session?.user) {
    return redirectToSignIn(request, url);
  }

  const clientId = url.searchParams.get("client_id") ?? "";
  const client = (await auth.api
    .getOAuthClientPublic({ query: { client_id: clientId }, headers: request.headers })
    .catch(() => null)) as { client_name?: string; client_uri?: string } | null;

  if (!client) {
    return new Response("Unknown MCP client. Start the connection again from your MCP client.", { status: 400 });
  }

  return new Response(
    renderConsentPage({
      clientName: client.client_name || clientId,
      clientUri: client.client_uri,
      scopes: (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean),
      oauthQuery: url.search.slice(1),
      userEmail: session.user.email,
    }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};
