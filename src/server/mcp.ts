import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata, withMcpAuth } from "better-auth/plugins";

import { createAppMcpServer, createRemoteMcpBackend } from "@/mcp/server";
import { auth } from "@/server/auth";
import { githubConfigured } from "@/server/env";
import { getSessionFromRequest } from "@/server/session";

type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  extra: {
    userId: string;
  };
};

type McpSession = {
  accessToken: string;
  clientId: string;
  userId: string;
  scopes: string;
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

const toAuthInfo = (session: McpSession): AuthInfo => ({
  token: session.accessToken,
  clientId: session.clientId,
  scopes: session.scopes.split(" ").filter(Boolean),
  extra: {
    userId: session.userId,
  },
});

const normalizeUnauthorizedMcpResponse = async (request: Request, response: Response) => {
  if (response.status !== 401) {
    return response;
  }

  const authenticateHeader = response.headers.get("www-authenticate");

  if (!authenticateHeader) {
    return response;
  }

  const protectedResourceUrl = new URL("/.well-known/oauth-protected-resource", request.url).toString();
  const normalizedAuthenticateHeader = authenticateHeader.replace(
    /resource_metadata="[^"]+"/,
    `resource_metadata="${protectedResourceUrl}"`,
  );

  const headers = new Headers(response.headers);
  headers.set("www-authenticate", normalizedAuthenticateHeader);
  headers.set("WWW-Authenticate", normalizedAuthenticateHeader);

  const payload = await response.clone().json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object") {
    const normalizedPayload = {
      ...payload,
      error: {
        ...payload.error,
        "www-authenticate": normalizedAuthenticateHeader,
      },
    };

    return new Response(JSON.stringify(normalizedPayload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const handleAuthorizedMcpRequest = withMcpAuth(auth, async (request, session) => {
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
    authInfo: toAuthInfo(session),
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
});

const discoveryHandler = oAuthDiscoveryMetadata(auth);
const protectedResourceHandler = oAuthProtectedResourceMetadata(auth);

export const handleMcpRequest = async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const response = await handleAuthorizedMcpRequest(request);
  return normalizeUnauthorizedMcpResponse(request, response);
};

export const handleMcpDiscovery = (request: Request) => {
  return discoveryHandler(request);
};

export const handleMcpProtectedResource = (request: Request) => {
  return protectedResourceHandler(request);
};

export const handleMcpLogin = async (request: Request) => {
  if (!githubConfigured) {
    return new Response("GitHub auth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.", {
      status: 503,
    });
  }

  const url = new URL(request.url);
  const callbackPath = `/mcp/login${url.search}`;
  const session = await getSessionFromRequest(request);

  if (!session?.user) {
    const signInUrl = new URL("/auth/github", request.url);
    signInUrl.searchParams.set("callback", callbackPath);
    return Response.redirect(signInUrl.toString(), 302);
  }

  const authorizeUrl = new URL(`/api/auth/mcp/authorize${url.search}`, request.url);
  return Response.redirect(authorizeUrl.toString(), 302);
};
