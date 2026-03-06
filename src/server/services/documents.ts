import { and, desc, eq } from "drizzle-orm";
import { createPatch } from "diff";

import { replaceCollaborationMarkdownIfRoomActive } from "@/server/collaboration";
import { db } from "@/server/db/client";
import { documentMembers, documents, type DocumentVisibility, user, versions } from "@/server/db/schema";

type AccessLevel = "read" | "write" | "owner";

const roleRank = {
  viewer: 1,
  editor: 2,
  owner: 3,
} as const;

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

const createShareId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export const getSharePath = (shareId: string) => `/d/${shareId}`;

const generateShareId = async () => {
  for (;;) {
    const shareId = createShareId();
    const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.shareId, shareId)).limit(1);
    if (!existing) {
      return shareId;
    }
  }
};

const getMembership = async (userId: string, documentId: string) => {
  const [membership] = await db
    .select({
      role: documentMembers.role,
      title: documents.title,
      ownerId: documents.ownerId,
      visibility: documents.visibility,
      shareId: documents.shareId,
    })
    .from(documentMembers)
    .innerJoin(documents, eq(documents.id, documentMembers.documentId))
    .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId)))
    .limit(1);

  return membership ?? null;
};

export const ensureAccess = async (userId: string, documentId: string, level: AccessLevel) => {
  const membership = await getMembership(userId, documentId);

  if (!membership) {
    throw jsonError(404, "Document not found");
  }

  const requiredRank = level === "read" ? 1 : level === "write" ? 2 : 3;

  if (roleRank[membership.role] < requiredRank) {
    throw jsonError(403, "Forbidden");
  }

  return membership;
};

export const listDocuments = async (userId: string) => {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      role: documentMembers.role,
      ownerId: documents.ownerId,
      visibility: documents.visibility,
      shareId: documents.shareId,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documentMembers)
    .innerJoin(documents, eq(documents.id, documentMembers.documentId))
    .where(eq(documentMembers.userId, userId))
    .orderBy(desc(documents.updatedAt));

  return rows.map(document => ({
    ...document,
    sharePath: getSharePath(document.shareId),
  }));
};

export const createDocument = async (
  userId: string,
  title: string,
  input?: {
    markdown?: string;
    visibility?: DocumentVisibility;
  },
) => {
  const now = new Date();
  const documentId = crypto.randomUUID();
  const shareId = await generateShareId();

  await db.insert(documents).values({
    id: documentId,
    title: title.trim() || "Untitled document",
    ownerId: userId,
    visibility: input?.visibility ?? "private",
    shareId,
    currentMarkdown: input?.markdown ?? "",
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
      visibility: documents.visibility,
      shareId: documents.shareId,
      currentMarkdown: documents.currentMarkdown,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw jsonError(404, "Document not found");
  }

  return {
    ...document,
    role: membership.role,
    sharePath: getSharePath(document.shareId),
  };
};

export const getSharedDocument = async (shareId: string, viewerUserId?: string | null) => {
  const [document] = await db
    .select({
      id: documents.id,
      title: documents.title,
      ownerId: documents.ownerId,
      visibility: documents.visibility,
      shareId: documents.shareId,
      currentMarkdown: documents.currentMarkdown,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.shareId, shareId))
    .limit(1);

  if (!document) {
    throw jsonError(404, "Document not found");
  }

  const membership = viewerUserId ? await getMembership(viewerUserId, document.id) : null;

  if (!membership && document.visibility === "private") {
    throw jsonError(404, "Document not found");
  }

  return {
    ...document,
    role: membership?.role ?? null,
    sharePath: getSharePath(document.shareId),
  };
};

export const updateDocument = async (
  userId: string,
  documentId: string,
  input: {
    title?: string;
    markdown?: string;
    visibility?: DocumentVisibility;
  },
) => {
  const membership = await ensureAccess(userId, documentId, "write");

  if (input.visibility && membership.ownerId !== userId) {
    throw jsonError(403, "Only owners can change document visibility");
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof input.title === "string") {
    updates.title = input.title.trim() || "Untitled document";
  }

  if (typeof input.markdown === "string") {
    updates.currentMarkdown = input.markdown;
  }

  if (input.visibility) {
    updates.visibility = input.visibility;
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
    throw jsonError(404, "Version not found");
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
    throw jsonError(404, "Version not found");
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
    throw jsonError(403, "Only owners can manage sharing");
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
    throw jsonError(404, "User not found");
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
    throw jsonError(403, "Only owners can manage sharing");
  }

  if (memberUserId === ownerId) {
    throw jsonError(400, "Owners cannot remove themselves");
  }

  await db
    .delete(documentMembers)
    .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, memberUserId)));

  return listMembers(ownerId, documentId);
};
