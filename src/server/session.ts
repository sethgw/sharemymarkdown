import { auth } from "@/server/auth";

type SessionPayload = {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
};

export type AuthSession = SessionPayload;

export const getSessionFromRequest = async (request: Request) => {
  const sessionRequest = new Request(new URL("/api/auth/get-session", request.url), {
    method: "GET",
    headers: request.headers,
  });

  const response = await auth.handler(sessionRequest);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SessionPayload | null;
};

export const requireSession = async (request: Request): Promise<AuthSession> => {
  const session = await getSessionFromRequest(request);

  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return session;
};
