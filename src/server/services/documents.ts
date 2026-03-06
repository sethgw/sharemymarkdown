import { and, desc, eq } from "drizzle-orm";
import { createPatch } from "diff";

import { replaceCollaborationMarkdownIfRoomActive } from "@/server/collaboration";
import { db } from "@/server/db/client";
import { documentMembers, documents, user, versions } from "@/server/db/schema";

type AccessLevel = "read" | "write" | "owner";

const roleRank = {
  viewer: 1,
  editor: 2,
  owner: 3,
} as const;

export const ensureAccess = async (userId: string, documentId: string, level: AccessLevel) => {
  const [membership] = await db
    .select({
      role: documentMembers.role,
      title: documents.title,
      ownerId: documents.ownerId,
    })
    .from(documentMembers)
    .innerJoin(documents, eq(documents.id, documentMembers.documentId))
    .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const requiredRank = level === "read" ? 1 : level === "write" ? 2 : 3;

  if (roleRank[membership.role] < requiredRank) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  return membership;
};

export const listDocuments = async (userId: string) => {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      role: documentMembers.role,
      ownerId: documents.ownerId,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documentMembers)
    .innerJoin(documents, eq(documents.id, documentMembers.documentId))
    .where(eq(documentMembers.userId, userId))
    .orderBy(desc(documents.updatedAt));
};

export const createDocument = async (userId: string, title: string) => {
  const now = new Date();
  const documentId = crypto.randomUUID();

  await db.insert(documents).values({
    id: documentId,
    title: title.trim() || "Untitled document",
    ownerId: userId,
    currentMarkdown: "",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(documentMembers).values({
    documentId,
    userId,
    role: "owner",
    createdAt: now,
  });

  return documentId;
};

export const getDocument = async (userId: string, documentId: string) => {
  const membership = await ensureAccess(userId, documentId, "read");

  const [document] = await db
    .select({
      id: documents.id,
      title: documents.title,
      ownerId: documents.ownerId,
      currentMarkdown: documents.currentMarkdown,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return {
    ...document,
    role: membership.role,
  };
};

export const updateDocument = async (
  userId: string,
  documentId: string,
  input: {
    title?: string;
    markdown?: string;
  },
) => {
  await ensureAccess(userId, documentId, "write");

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof input.title === "string") {
    updates.title = input.title.trim() || "Untitled document";
  }

  if (typeof input.markdown === "string") {
    updates.currentMarkdown = input.markdown;
  }

  await db.update(documents).set(updates).where(eq(documents.id, documentId));

  if (typeof input.markdown === "string") {
    await replaceCollaborationMarkdownIfRoomActive(documentId, input.markdown, userId);
  }

  return getDocument(userId, documentId);
};

export const listVersions = async (userId: string, documentId: string) => {
  await ensureAccess(userId, documentId, "read");

  return db
    .select({
      id: versions.id,
      parentVersionId: versions.parentVersionId,
      message: versions.message,
      authorId: versions.authorId,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .where(eq(versions.documentId, documentId))
    .orderBy(desc(versions.createdAt));
};

export const createVersion = async (userId: string, documentId: string, message: string) => {
  await ensureAccess(userId, documentId, "write");

  const [document] = await db
    .select({
      markdown: documents.currentMarkdown,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  const [latestVersion] = await db
    .select({
      id: versions.id,
    })
    .from(versions)
    .where(eq(versions.documentId, documentId))
    .orderBy(desc(versions.createdAt))
    .limit(1);

  const id = crypto.randomUUID();

  await db.insert(versions).values({
    id,
    documentId,
    parentVersionId: latestVersion?.id ?? null,
    authorId: userId,
    message: message.trim() || "Saved version",
    markdown: document?.markdown ?? "",
    createdAt: new Date(),
  });

  return id;
};

export const diffVersions = async (userId: string, documentId: string, fromVersionId: string, toVersionId: string) => {
  await ensureAccess(userId, documentId, "read");

  const versionRows = await db
    .select({
      id: versions.id,
      message: versions.message,
      markdown: versions.markdown,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .where(eq(versions.documentId, documentId));

  const from = versionRows.find(version => version.id === fromVersionId);
  const to = versionRows.find(version => version.id === toVersionId);

  if (!from || !to) {
    throw new Response(JSON.stringify({ error: "Version not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return {
    from,
    to,
    patch: createPatch(`document-${documentId}.md`, from.markdown, to.markdown, from.message, to.message),
  };
};

export const restoreVersion = async (userId: string, documentId: string, versionId: string) => {
  await ensureAccess(userId, documentId, "write");

  const [version] = await db
    .select({
      markdown: versions.markdown,
    })
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.documentId, documentId)))
    .limit(1);

  if (!version) {
    throw new Response(JSON.stringify({ error: "Version not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  await db
    .update(documents)
    .set({
      currentMarkdown: version.markdown,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  await replaceCollaborationMarkdownIfRoomActive(documentId, version.markdown, userId);

  return getDocument(userId, documentId);
};

export const listMembers = async (userId: string, documentId: string) => {
  await ensureAccess(userId, documentId, "read");

  return db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: documentMembers.role,
      addedAt: documentMembers.createdAt,
    })
    .from(documentMembers)
    .innerJoin(user, eq(user.id, documentMembers.userId))
    .where(eq(documentMembers.documentId, documentId))
    .orderBy(documentMembers.role, user.email);
};

export const grantMember = async (ownerId: string, documentId: string, email: string, role: "editor" | "viewer") => {
  const membership = await ensureAccess(ownerId, documentId, "owner");

  if (membership.ownerId !== ownerId) {
    throw new Response(JSON.stringify({ error: "Only owners can manage sharing" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const [member] = await db
    .select({
      id: user.id,
      email: user.email,
    })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);

  if (!member) {
    throw new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  await db
    .insert(documentMembers)
    .values({
      documentId,
      userId: member.id,
      role,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [documentMembers.documentId, documentMembers.userId],
      set: {
        role,
      },
    });

  return listMembers(ownerId, documentId);
};

export const revokeMember = async (ownerId: string, documentId: string, memberUserId: string) => {
  const membership = await ensureAccess(ownerId, documentId, "owner");

  if (membership.ownerId !== ownerId) {
    throw new Response(JSON.stringify({ error: "Only owners can manage sharing" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (memberUserId === ownerId) {
    throw new Response(JSON.stringify({ error: "Owners cannot remove themselves" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await db
    .delete(documentMembers)
    .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, memberUserId)));

  return listMembers(ownerId, documentId);
};
