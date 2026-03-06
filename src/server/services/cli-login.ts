import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { cliLoginRequests } from "@/server/db/schema";

const loginRequestLifetimeMs = 10 * 60 * 1000;

export const startCliLogin = async () => {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + loginRequestLifetimeMs);

  await db.insert(cliLoginRequests).values({
    id,
    createdAt: now,
    expiresAt,
  });

  return {
    id,
    expiresAt,
  };
};

export const getCliLogin = async (id: string) => {
  const [request] = await db
    .select({
      id: cliLoginRequests.id,
      userId: cliLoginRequests.userId,
      token: cliLoginRequests.token,
      createdAt: cliLoginRequests.createdAt,
      expiresAt: cliLoginRequests.expiresAt,
      completedAt: cliLoginRequests.completedAt,
    })
    .from(cliLoginRequests)
    .where(eq(cliLoginRequests.id, id))
    .limit(1);

  if (!request) {
    throw new Response(JSON.stringify({ error: "Login request not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return request;
};

export const completeCliLogin = async (id: string, userId: string, token: string) => {
  const request = await getCliLogin(id);

  if (request.expiresAt < new Date()) {
    throw new Response(JSON.stringify({ error: "Login request expired" }), {
      status: 410,
      headers: { "content-type": "application/json" },
    });
  }

  await db
    .update(cliLoginRequests)
    .set({
      userId,
      token,
      completedAt: new Date(),
    })
    .where(eq(cliLoginRequests.id, id));
};

export const consumeCliLogin = async (id: string) => {
  const request = await getCliLogin(id);

  if (request.expiresAt < new Date()) {
    throw new Response(JSON.stringify({ error: "Login request expired" }), {
      status: 410,
      headers: { "content-type": "application/json" },
    });
  }

  if (!request.token) {
    return {
      status: "pending" as const,
      request,
    };
  }

  await db
    .update(cliLoginRequests)
    .set({
      token: null,
    })
    .where(and(eq(cliLoginRequests.id, id), eq(cliLoginRequests.token, request.token)));

  return {
    status: "complete" as const,
    token: request.token,
    request,
  };
};
