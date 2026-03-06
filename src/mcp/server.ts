import { eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { listDocumentPresence } from "@/server/collaboration";
import { apiFetch, readSessionToken } from "@/local/client";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import {
  createDocument,
  createVersion,
  diffVersions,
  getDocument,
  grantMember,
  listDocuments,
  listMembers,
  listVersions,
  restoreVersion,
  revokeMember,
  updateDocument,
} from "@/server/services/documents";
import {
  applyRevision,
  createRevision,
  diffRevision,
  getRevision,
  listRevisions,
  updateRevision,
} from "@/server/services/revisions";

type TextContent = {
  type: "text";
  text: string;
};

type ToolExtra = {
  authInfo?: {
    token?: string;
    clientId?: string;
    scopes?: string[];
    extra?: Record<string, unknown>;
  };
};

type AuthStatusResult = {
  user: { id: string; email: string; name: string } | null;
  session: { id: string } | null;
  clientId?: string;
  scopes?: string[];
};

type DocumentSummary = {
  id: string;
  title: string;
  role: string;
  updatedAt: string;
};

type DocumentDetail = {
  id: string;
  title: string;
  role: string;
  currentMarkdown: string;
  updatedAt: string;
};

type VersionSummary = {
  id: string;
  message: string;
  createdAt: string;
  parentVersionId: string | null;
};

type MemberSummary = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

type PresenceSummary = {
  userId: string;
  name: string;
  email: string;
  role: string;
  connections: number;
};

type RevisionSummary = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "review" | "applied";
  authorId: string;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
};

type RevisionDetail = RevisionSummary & {
  baseMarkdown: string;
  markdown: string;
};

type McpBackend = {
  authStatus: () => Promise<AuthStatusResult>;
  listDocuments: () => Promise<DocumentSummary[]>;
  createDocument: (title?: string) => Promise<DocumentDetail>;
  getDocument: (documentId: string) => Promise<DocumentDetail>;
  updateDocument: (documentId: string, input: { title?: string; markdown?: string }) => Promise<DocumentDetail>;
  listPresence: (documentId: string) => Promise<PresenceSummary[]>;
  listVersions: (documentId: string) => Promise<VersionSummary[]>;
  saveVersion: (documentId: string, message?: string) => Promise<{ versionId: string }>;
  diffVersions: (documentId: string, fromVersionId: string, toVersionId: string) => Promise<{ patch: string; from: unknown; to: unknown }>;
  restoreVersion: (documentId: string, versionId: string) => Promise<{ id: string; title: string; currentMarkdown: string }>;
  listRevisions: (documentId: string) => Promise<RevisionSummary[]>;
  createRevision: (documentId: string, title?: string) => Promise<RevisionDetail>;
  getRevision: (documentId: string, revisionId: string) => Promise<RevisionDetail>;
  updateRevision: (
    documentId: string,
    revisionId: string,
    input: { title?: string; description?: string; markdown?: string; status?: "draft" | "review" },
  ) => Promise<RevisionDetail>;
  diffRevision: (documentId: string, revisionId: string, compareTo?: "base" | "live") => Promise<{ patch: string; compareTo: string }>;
  applyRevision: (documentId: string, revisionId: string) => Promise<{ id: string; title: string; currentMarkdown: string }>;
  listMembers: (documentId: string) => Promise<MemberSummary[]>;
  grantAccess: (documentId: string, email: string, role: "viewer" | "editor") => Promise<MemberSummary[]>;
  revokeAccess: (documentId: string, userId: string) => Promise<MemberSummary[]>;
};

type BackendFactory = (extra: ToolExtra) => Promise<McpBackend>;

const asStructured = <T,>(text: string, structuredContent: T) => ({
  content: [{ type: "text", text }] satisfies TextContent[],
  structuredContent,
});

const requireLocalToken = async () => {
  const token = await readSessionToken();
  if (!token) {
    throw new Error("No CLI session token found. Run `bun run cli auth login` first.");
  }
};

const getRemoteAuth = (extra: ToolExtra) => {
  const userId = extra.authInfo?.extra?.userId;

  if (typeof userId !== "string" || !userId) {
    throw new Error("Missing MCP authentication context.");
  }

  return {
    userId,
    token: extra.authInfo?.token ?? "mcp",
    clientId: extra.authInfo?.clientId,
    scopes: extra.authInfo?.scopes ?? [],
  };
};

const formatDocumentList = (documents: DocumentSummary[]) => {
  return documents.length === 0
    ? "No documents"
    : documents.map(document => `${document.id}  ${document.title}  [${document.role}]  ${document.updatedAt}`).join("\n");
};

const formatVersionList = (versions: VersionSummary[]) => {
  return versions.length === 0 ? "No versions" : versions.map(version => `${version.id}  ${version.message}  ${version.createdAt}`).join("\n");
};

const formatPresenceList = (presence: PresenceSummary[]) => {
  return presence.length === 0
    ? "No active collaborators"
    : presence.map(entry => `${entry.userId}  ${entry.name}  [${entry.role}]  ${entry.connections} connection${entry.connections === 1 ? "" : "s"}`).join("\n");
};

const formatRevisionList = (revisions: RevisionSummary[]) => {
  return revisions.length === 0
    ? "No revisions"
    : revisions.map(revision => `${revision.id}  ${revision.title}  [${revision.status}]  ${revision.updatedAt}`).join("\n");
};

const formatMemberList = (members: MemberSummary[]) => {
  return members.length === 0 ? "No members" : members.map(member => `${member.userId}  ${member.email}  [${member.role}]  ${member.name}`).join("\n");
};

export const createLocalMcpBackend: BackendFactory = async () => {
  await requireLocalToken();

  return {
    authStatus: () =>
      apiFetch<AuthStatusResult>("/api/session").then(response => ({
        user: response.user,
        session: response.session,
      })),
    listDocuments: () => apiFetch<DocumentSummary[]>("/api/documents"),
    createDocument: title =>
      apiFetch<DocumentDetail>("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    getDocument: documentId => apiFetch<DocumentDetail>(`/api/documents/${documentId}`),
    updateDocument: (documentId, input) =>
      apiFetch<DocumentDetail>(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    listPresence: documentId => apiFetch<PresenceSummary[]>(`/api/documents/${documentId}/presence`),
    listVersions: documentId => apiFetch<VersionSummary[]>(`/api/documents/${documentId}/versions`),
    saveVersion: (documentId, message) =>
      apiFetch<{ versionId: string }>(`/api/documents/${documentId}/versions`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    diffVersions: (documentId, fromVersionId, toVersionId) =>
      apiFetch<{ patch: string; from: unknown; to: unknown }>(
        `/api/documents/${documentId}/diff?from=${encodeURIComponent(fromVersionId)}&to=${encodeURIComponent(toVersionId)}`,
      ),
    restoreVersion: (documentId, versionId) =>
      apiFetch<{ id: string; title: string; currentMarkdown: string }>(`/api/documents/${documentId}/restore/${versionId}`, {
        method: "POST",
      }),
    listRevisions: documentId => apiFetch<RevisionSummary[]>(`/api/documents/${documentId}/revisions`),
    createRevision: (documentId, title) =>
      apiFetch<RevisionDetail>(`/api/documents/${documentId}/revisions`, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    getRevision: (documentId, revisionId) => apiFetch<RevisionDetail>(`/api/documents/${documentId}/revisions/${revisionId}`),
    updateRevision: (documentId, revisionId, input) =>
      apiFetch<RevisionDetail>(`/api/documents/${documentId}/revisions/${revisionId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    diffRevision: (documentId, revisionId, compareTo = "live") =>
      apiFetch<{ patch: string; compareTo: string }>(`/api/documents/${documentId}/revisions/${revisionId}/diff?compare=${compareTo}`),
    applyRevision: (documentId, revisionId) =>
      apiFetch<{ id: string; title: string; currentMarkdown: string }>(`/api/documents/${documentId}/revisions/${revisionId}/apply`, {
        method: "POST",
      }),
    listMembers: documentId => apiFetch<MemberSummary[]>(`/api/documents/${documentId}/members`),
    grantAccess: (documentId, email, role) =>
      apiFetch<MemberSummary[]>(`/api/documents/${documentId}/members`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    revokeAccess: (documentId, userId) =>
      apiFetch<MemberSummary[]>(`/api/documents/${documentId}/members/${userId}`, {
        method: "DELETE",
      }),
  };
};

export const createRemoteMcpBackend: BackendFactory = async extra => {
  const auth = getRemoteAuth(extra);

  return {
    authStatus: async () => {
      const [currentUser] = await db
        .select({
          id: user.id,
          email: user.email,
          name: user.name,
        })
        .from(user)
        .where(eq(user.id, auth.userId))
        .limit(1);

      return {
        user: currentUser ?? null,
        session: {
          id: auth.token,
        },
        clientId: auth.clientId,
        scopes: auth.scopes,
      };
    },
    listDocuments: async () => {
      const documents = await listDocuments(auth.userId);
      return documents.map(document => ({
        id: document.id,
        title: document.title,
        role: document.role,
        updatedAt: document.updatedAt.toISOString(),
      }));
    },
    createDocument: async title => {
      const documentId = await createDocument(auth.userId, title ?? "");
      const document = await getDocument(auth.userId, documentId);
      return {
        id: document.id,
        title: document.title,
        role: document.role,
        currentMarkdown: document.currentMarkdown,
        updatedAt: document.updatedAt.toISOString(),
      };
    },
    getDocument: async documentId => {
      const document = await getDocument(auth.userId, documentId);
      return {
        id: document.id,
        title: document.title,
        role: document.role,
        currentMarkdown: document.currentMarkdown,
        updatedAt: document.updatedAt.toISOString(),
      };
    },
    updateDocument: async (documentId, input) => {
      const document = await updateDocument(auth.userId, documentId, input);
      return {
        id: document.id,
        title: document.title,
        role: document.role,
        currentMarkdown: document.currentMarkdown,
        updatedAt: document.updatedAt.toISOString(),
      };
    },
    listPresence: documentId => listDocumentPresence(documentId),
    listVersions: async documentId => {
      const versions = await listVersions(auth.userId, documentId);
      return versions.map(version => ({
        id: version.id,
        message: version.message,
        createdAt: version.createdAt.toISOString(),
        parentVersionId: version.parentVersionId,
      }));
    },
    saveVersion: async (documentId, message) => ({
      versionId: await createVersion(auth.userId, documentId, message ?? ""),
    }),
    diffVersions: (documentId, fromVersionId, toVersionId) => diffVersions(auth.userId, documentId, fromVersionId, toVersionId),
    restoreVersion: (documentId, versionId) => restoreVersion(auth.userId, documentId, versionId),
    listRevisions: async documentId => {
      const revisions = await listRevisions(auth.userId, documentId);
      return revisions.map(revision => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
        updatedAt: revision.updatedAt.toISOString(),
        appliedAt: revision.appliedAt?.toISOString() ?? null,
      }));
    },
    createRevision: async (documentId, title) => {
      const revision = await createRevision(auth.userId, documentId, { title });
      return {
        ...revision,
        createdAt: revision.createdAt.toISOString(),
        updatedAt: revision.updatedAt.toISOString(),
        appliedAt: revision.appliedAt?.toISOString() ?? null,
      };
    },
    getRevision: async (documentId, revisionId) => {
      const revision = await getRevision(auth.userId, documentId, revisionId);
      return {
        ...revision,
        createdAt: revision.createdAt.toISOString(),
        updatedAt: revision.updatedAt.toISOString(),
        appliedAt: revision.appliedAt?.toISOString() ?? null,
      };
    },
    updateRevision: async (documentId, revisionId, input) => {
      const revision = await updateRevision(auth.userId, documentId, revisionId, input);
      return {
        ...revision,
        createdAt: revision.createdAt.toISOString(),
        updatedAt: revision.updatedAt.toISOString(),
        appliedAt: revision.appliedAt?.toISOString() ?? null,
      };
    },
    diffRevision: (documentId, revisionId, compareTo = "live") => diffRevision(auth.userId, documentId, revisionId, compareTo),
    applyRevision: (documentId, revisionId) => applyRevision(auth.userId, documentId, revisionId),
    listMembers: documentId => listMembers(auth.userId, documentId),
    grantAccess: (documentId, email, role) => grantMember(auth.userId, documentId, email, role),
    revokeAccess: (documentId, userId) => revokeMember(auth.userId, documentId, userId),
  };
};

export const createAppMcpServer = (getBackend: BackendFactory) => {
  const server = new McpServer({
    name: "sharemymarkdown",
    version: "0.1.0",
  });

  server.registerTool(
    "auth_status",
    {
      title: "Auth Status",
      description: "Show the authenticated user and client context for this MCP session.",
      inputSchema: {},
    },
    async (_, extra) => {
      const backend = await getBackend(extra);
      const response = await backend.authStatus();
      const identity = response.user ? `${response.user.name} <${response.user.email}>` : "No active session";
      const suffix = response.clientId ? ` [${response.clientId}]` : "";
      return asStructured(`${identity}${suffix}`, response);
    },
  );

  server.registerTool(
    "list_documents",
    {
      title: "List Documents",
      description: "List the Markdown documents visible to the current user.",
      inputSchema: {},
    },
    async (_, extra) => {
      const backend = await getBackend(extra);
      const documents = await backend.listDocuments();
      return asStructured(formatDocumentList(documents), { documents });
    },
  );

  server.registerTool(
    "create_document",
    {
      title: "Create Document",
      description: "Create a new Markdown document.",
      inputSchema: {
        title: z.string().optional().describe("Optional title for the document."),
      },
    },
    async ({ title }, extra) => {
      const backend = await getBackend(extra);
      const document = await backend.createDocument(title);
      return asStructured(`Created ${document.title} (${document.id})`, { document });
    },
  );

  server.registerTool(
    "get_document",
    {
      title: "Get Document",
      description: "Fetch the current content and metadata for a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
      },
    },
    async ({ documentId }, extra) => {
      const backend = await getBackend(extra);
      const document = await backend.getDocument(documentId);
      return asStructured(`# ${document.title}\n\n${document.currentMarkdown}`, { document });
    },
  );

  server.registerTool(
    "update_document",
    {
      title: "Update Document",
      description: "Update the title and or Markdown content of a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        title: z.string().optional().describe("Updated title."),
        markdown: z.string().optional().describe("Updated Markdown content."),
      },
    },
    async ({ documentId, title, markdown }, extra) => {
      const backend = await getBackend(extra);
      const document = await backend.updateDocument(documentId, { title, markdown });
      return asStructured(`Updated ${document.title}`, { document });
    },
  );

  server.registerTool(
    "list_presence",
    {
      title: "List Presence",
      description: "Show who is actively connected to a document right now.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
      },
    },
    async ({ documentId }, extra) => {
      const backend = await getBackend(extra);
      const presence = await backend.listPresence(documentId);
      return asStructured(formatPresenceList(presence), { presence });
    },
  );

  server.registerTool(
    "list_versions",
    {
      title: "List Versions",
      description: "List saved versions for a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
      },
    },
    async ({ documentId }, extra) => {
      const backend = await getBackend(extra);
      const versions = await backend.listVersions(documentId);
      return asStructured(formatVersionList(versions), { versions });
    },
  );

  server.registerTool(
    "save_version",
    {
      title: "Save Version",
      description: "Create a named version checkpoint for a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        message: z.string().optional().describe("Version message."),
      },
    },
    async ({ documentId, message }, extra) => {
      const backend = await getBackend(extra);
      const response = await backend.saveVersion(documentId, message);
      return asStructured(`Saved version ${response.versionId}`, response);
    },
  );

  server.registerTool(
    "diff_versions",
    {
      title: "Diff Versions",
      description: "Render a readable diff between two saved versions.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        fromVersionId: z.string().describe("The older version id."),
        toVersionId: z.string().describe("The newer version id."),
      },
    },
    async ({ documentId, fromVersionId, toVersionId }, extra) => {
      const backend = await getBackend(extra);
      const response = await backend.diffVersions(documentId, fromVersionId, toVersionId);
      return asStructured(response.patch, response);
    },
  );

  server.registerTool(
    "restore_version",
    {
      title: "Restore Version",
      description: "Restore a document to a prior saved version.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        versionId: z.string().describe("The version id to restore."),
      },
    },
    async ({ documentId, versionId }, extra) => {
      const backend = await getBackend(extra);
      const document = await backend.restoreVersion(documentId, versionId);
      return asStructured(`Restored ${document.title}`, { document });
    },
  );

  server.registerTool(
    "list_revisions",
    {
      title: "List Revisions",
      description: "List draft and review revisions for a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
      },
    },
    async ({ documentId }, extra) => {
      const backend = await getBackend(extra);
      const revisions = await backend.listRevisions(documentId);
      return asStructured(formatRevisionList(revisions), { revisions });
    },
  );

  server.registerTool(
    "create_revision",
    {
      title: "Create Revision",
      description: "Fork the current live document into a revision draft.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        title: z.string().optional().describe("Optional revision title."),
      },
    },
    async ({ documentId, title }, extra) => {
      const backend = await getBackend(extra);
      const revision = await backend.createRevision(documentId, title);
      return asStructured(`Created revision ${revision.title} (${revision.id})`, { revision });
    },
  );

  server.registerTool(
    "get_revision",
    {
      title: "Get Revision",
      description: "Fetch the full content and metadata for a revision draft.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        revisionId: z.string().describe("The revision id."),
      },
    },
    async ({ documentId, revisionId }, extra) => {
      const backend = await getBackend(extra);
      const revision = await backend.getRevision(documentId, revisionId);
      return asStructured(`# ${revision.title}\n\n${revision.markdown}`, { revision });
    },
  );

  server.registerTool(
    "update_revision",
    {
      title: "Update Revision",
      description: "Update a revision title, description, status, or Markdown content.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        revisionId: z.string().describe("The revision id."),
        title: z.string().optional().describe("Updated title."),
        description: z.string().optional().describe("Updated description."),
        markdown: z.string().optional().describe("Updated revision Markdown."),
        status: z.enum(["draft", "review"]).optional().describe("Revision workflow status."),
      },
    },
    async ({ documentId, revisionId, title, description, markdown, status }, extra) => {
      const backend = await getBackend(extra);
      const revision = await backend.updateRevision(documentId, revisionId, { title, description, markdown, status });
      return asStructured(`Updated revision ${revision.title}`, { revision });
    },
  );

  server.registerTool(
    "diff_revision",
    {
      title: "Diff Revision",
      description: "Render a readable diff between a revision and the live or base document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        revisionId: z.string().describe("The revision id."),
        compareTo: z.enum(["base", "live"]).optional().describe("Compare against the base snapshot or current live document."),
      },
    },
    async ({ documentId, revisionId, compareTo }, extra) => {
      const backend = await getBackend(extra);
      const response = await backend.diffRevision(documentId, revisionId, compareTo);
      return asStructured(response.patch, response);
    },
  );

  server.registerTool(
    "apply_revision",
    {
      title: "Apply Revision",
      description: "Apply a revision draft to the live document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        revisionId: z.string().describe("The revision id."),
      },
    },
    async ({ documentId, revisionId }, extra) => {
      const backend = await getBackend(extra);
      const document = await backend.applyRevision(documentId, revisionId);
      return asStructured(`Applied revision to ${document.title}`, { document });
    },
  );

  server.registerTool(
    "list_members",
    {
      title: "List Members",
      description: "List collaborators and roles for a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
      },
    },
    async ({ documentId }, extra) => {
      const backend = await getBackend(extra);
      const members = await backend.listMembers(documentId);
      return asStructured(formatMemberList(members), { members });
    },
  );

  server.registerTool(
    "grant_access",
    {
      title: "Grant Access",
      description: "Grant viewer or editor access to a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        email: z.string().email().describe("Collaborator email."),
        role: z.enum(["viewer", "editor"]).describe("Role to grant."),
      },
    },
    async ({ documentId, email, role }, extra) => {
      const backend = await getBackend(extra);
      const members = await backend.grantAccess(documentId, email, role);
      return asStructured(`Granted ${role} to ${email}`, { members });
    },
  );

  server.registerTool(
    "revoke_access",
    {
      title: "Revoke Access",
      description: "Remove a collaborator from a document.",
      inputSchema: {
        documentId: z.string().describe("The document id."),
        userId: z.string().describe("The user id to remove."),
      },
    },
    async ({ documentId, userId }, extra) => {
      const backend = await getBackend(extra);
      const members = await backend.revokeAccess(documentId, userId);
      return asStructured(`Revoked access for ${userId}`, { members });
    },
  );

  return server;
};
