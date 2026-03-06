import { and, desc, eq } from "drizzle-orm";
import { createPatch } from "diff";

import { replaceCollaborationMarkdownIfRoomActive } from "@/server/collaboration";
import { db } from "@/server/db/client";
import { documentRevisions, documents } from "@/server/db/schema";
import { ensureAccess, getDocument } from "@/server/services/documents";

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

const ensureRevisionAccess = async (
  userId: string,
  documentId: string,
  revisionId: string,
  level: "read" | "write",
) => {
  const membership = await ensureAccess(userId, documentId, level);

  const [revision] = await db
    .select({
      id: documentRevisions.id,
      documentId: documentRevisions.documentId,
      authorId: documentRevisions.authorId,
      title: documentRevisions.title,
      description: documentRevisions.description,
      status: documentRevisions.status,
      baseMarkdown: documentRevisions.baseMarkdown,
      markdown: documentRevisions.markdown,
      createdAt: documentRevisions.createdAt,
      updatedAt: documentRevisions.updatedAt,
      appliedAt: documentRevisions.appliedAt,
    })
    .from(documentRevisions)
    .where(and(eq(documentRevisions.id, revisionId), eq(documentRevisions.documentId, documentId)))
    .limit(1);

  if (!revision) {
    throw jsonError(404, "Revision not found");
  }

  if (level === "write" && revision.authorId !== userId && membership.ownerId !== userId) {
    throw jsonError(403, "Only the revision author or document owner can modify this revision");
  }

  return {
    membership,
    revision,
  };
};

export const listRevisions = async (userId: string, documentId: string) => {
  await ensureAccess(userId, documentId, "read");

  return db
    .select({
      id: documentRevisions.id,
      authorId: documentRevisions.authorId,
      title: documentRevisions.title,
      description: documentRevisions.description,
      status: documentRevisions.status,
      createdAt: documentRevisions.createdAt,
      updatedAt: documentRevisions.updatedAt,
      appliedAt: documentRevisions.appliedAt,
    })
    .from(documentRevisions)
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.updatedAt));
};

export const createRevision = async (
  userId: string,
  documentId: string,
  input: {
    title?: string;
    description?: string;
    markdown?: string;
  },
) => {
  await ensureAccess(userId, documentId, "write");

  const [document] = await db
    .select({
      title: documents.title,
      currentMarkdown: documents.currentMarkdown,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw jsonError(404, "Document not found");
  }

  const now = new Date();
  const revisionId = crypto.randomUUID();

  await db.insert(documentRevisions).values({
    id: revisionId,
    documentId,
    authorId: userId,
    title: input.title?.trim() || `Revision for ${document.title}`,
    description: input.description?.trim() ?? "",
    status: "draft",
    baseMarkdown: document.currentMarkdown,
    markdown: typeof input.markdown === "string" ? input.markdown : document.currentMarkdown,
    createdAt: now,
    updatedAt: now,
  });

  return getRevision(userId, documentId, revisionId);
};

export const getRevision = async (userId: string, documentId: string, revisionId: string) => {
  const { revision } = await ensureRevisionAccess(userId, documentId, revisionId, "read");
  return revision;
};

export const updateRevision = async (
  userId: string,
  documentId: string,
  revisionId: string,
  input: {
    title?: string;
    description?: string;
    markdown?: string;
    status?: "draft" | "review";
  },
) => {
  const { revision } = await ensureRevisionAccess(userId, documentId, revisionId, "write");

  if (revision.status === "applied") {
    throw jsonError(409, "Applied revisions are read-only");
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof input.title === "string") {
    updates.title = input.title.trim() || revision.title;
  }

  if (typeof input.description === "string") {
    updates.description = input.description.trim();
  }

  if (typeof input.markdown === "string") {
    updates.markdown = input.markdown;
  }

  if (input.status === "draft" || input.status === "review") {
    updates.status = input.status;
  }

  await db.update(documentRevisions).set(updates).where(eq(documentRevisions.id, revisionId));

  return getRevision(userId, documentId, revisionId);
};

export const diffRevision = async (
  userId: string,
  documentId: string,
  revisionId: string,
  compareTo: "base" | "live",
) => {
  const { revision } = await ensureRevisionAccess(userId, documentId, revisionId, "read");

  const [document] = await db
    .select({
      title: documents.title,
      currentMarkdown: documents.currentMarkdown,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw jsonError(404, "Document not found");
  }

  const sourceMarkdown = compareTo === "base" ? revision.baseMarkdown : document.currentMarkdown;
  const sourceLabel = compareTo === "base" ? `${revision.title} base` : `${document.title} live`;

  return {
    compareTo,
    revision,
    patch: createPatch(`document-${documentId}.md`, sourceMarkdown, revision.markdown, sourceLabel, revision.title),
  };
};

export const applyRevision = async (userId: string, documentId: string, revisionId: string) => {
  const { revision } = await ensureRevisionAccess(userId, documentId, revisionId, "write");
  const now = new Date();

  await db
    .update(documents)
    .set({
      currentMarkdown: revision.markdown,
      updatedAt: now,
    })
    .where(eq(documents.id, documentId));

  await db
    .update(documentRevisions)
    .set({
      status: "applied",
      appliedAt: now,
      updatedAt: now,
    })
    .where(eq(documentRevisions.id, revisionId));

  await replaceCollaborationMarkdownIfRoomActive(documentId, revision.markdown, userId);

  return getDocument(userId, documentId);
};
