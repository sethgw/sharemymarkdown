const markdownContentType = "text/markdown; charset=utf-8";

export const wantsMarkdown = (request: Request, url: URL) => {
  const format = url.searchParams.get("format");
  const accept = request.headers.get("accept") ?? "";
  return format === "md" || format === "markdown" || accept.includes("text/markdown");
};

export const markdown = (body: string, init?: ResponseInit) =>
  new Response(body, {
    ...init,
    headers: {
      "content-type": markdownContentType,
      ...(init?.headers ?? {}),
    },
  });

export const renderDocumentsMarkdown = (
  documents: Array<{
    id: string;
    title: string;
    role: string | null;
    updatedAt: Date | string;
    visibility?: string;
    sharePath?: string;
    shareUrl?: string;
  }>,
) => {
  if (documents.length === 0) {
    return "# Documents\n\nNo documents.";
  }

  return [
    "# Documents",
    "",
    ...documents.map(document =>
      [
        `- **${document.title}** \`${document.id}\``,
        `  role: ${document.role ?? "shared-read-only"}`,
        `  visibility: ${document.visibility ?? "private"}`,
        `  updated: ${new Date(document.updatedAt).toISOString()}`,
        ...(document.sharePath ? [`  share_path: ${document.sharePath}`] : []),
        ...(document.shareUrl ? [`  share_url: ${document.shareUrl}`] : []),
      ].join("  \n"),
    ),
  ].join("\n");
};

export const renderDocumentMarkdown = (document: {
  id: string;
  title: string;
  role: string | null;
  updatedAt: Date | string;
  currentMarkdown: string;
  visibility?: string;
  sharePath?: string;
  shareUrl?: string;
}) =>
  [
    `# ${document.title}`,
    "",
    `> document_id: \`${document.id}\``,
    `> role: ${document.role ?? "shared-read-only"}`,
    ...(document.visibility ? [`> visibility: ${document.visibility}`] : []),
    `> updated_at: ${new Date(document.updatedAt).toISOString()}`,
    ...(document.sharePath ? [`> share_path: ${document.sharePath}`] : []),
    ...(document.shareUrl ? [`> share_url: ${document.shareUrl}`] : []),
    "",
    document.currentMarkdown || "_Empty document._",
  ].join("\n");

export const renderVersionsMarkdown = (
  documentId: string,
  versions: Array<{
    id: string;
    message: string;
    createdAt: Date | string;
    parentVersionId: string | null;
  }>,
) => {
  if (versions.length === 0) {
    return `# Versions\n\nDocument: \`${documentId}\`\n\nNo versions.`;
  }

  return [
    "# Versions",
    "",
    `Document: \`${documentId}\``,
    "",
    ...versions.map(version => `- \`${version.id}\` **${version.message}**  \n  created: ${new Date(version.createdAt).toISOString()}${version.parentVersionId ? `  \n  parent: \`${version.parentVersionId}\`` : ""}`),
  ].join("\n");
};

export const renderRevisionsMarkdown = (
  documentId: string,
  revisions: Array<{
    id: string;
    title: string;
    status: string;
    authorId: string;
    updatedAt: Date | string;
  }>,
) => {
  if (revisions.length === 0) {
    return `# Revisions\n\nDocument: \`${documentId}\`\n\nNo revisions.`;
  }

  return [
    "# Revisions",
    "",
    `Document: \`${documentId}\``,
    "",
    ...revisions.map(revision => `- \`${revision.id}\` **${revision.title}**  \n  status: ${revision.status}  \n  author: \`${revision.authorId}\`  \n  updated: ${new Date(revision.updatedAt).toISOString()}`),
  ].join("\n");
};

export const renderRevisionMarkdown = (revision: {
  id: string;
  title: string;
  description: string;
  status: string;
  authorId: string;
  updatedAt: Date | string;
  markdown: string;
}) =>
  [
    `# Revision: ${revision.title}`,
    "",
    `> revision_id: \`${revision.id}\``,
    `> author_id: \`${revision.authorId}\``,
    `> status: ${revision.status}`,
    `> updated_at: ${new Date(revision.updatedAt).toISOString()}`,
    ...(revision.description ? ["", revision.description] : []),
    "",
    revision.markdown || "_Empty revision._",
  ].join("\n");

export const renderMembersMarkdown = (
  documentId: string,
  members: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
  }>,
) => {
  if (members.length === 0) {
    return `# Members\n\nDocument: \`${documentId}\`\n\nNo members.`;
  }

  return [
    "# Members",
    "",
    `Document: \`${documentId}\``,
    "",
    "| Name | Email | Role | User ID |",
    "| --- | --- | --- | --- |",
    ...members.map(member => `| ${member.name} | ${member.email} | ${member.role} | \`${member.userId}\` |`),
  ].join("\n");
};

export const renderPresenceMarkdown = (
  documentId: string,
  presence: Array<{
    userId: string;
    name: string;
    role: string;
    connections: number;
  }>,
) => {
  if (presence.length === 0) {
    return `# Presence\n\nDocument: \`${documentId}\`\n\nNo active collaborators.`;
  }

  return [
    "# Presence",
    "",
    `Document: \`${documentId}\``,
    "",
    "| Name | Role | Connections | User ID |",
    "| --- | --- | --- | --- |",
    ...presence.map(entry => `| ${entry.name} | ${entry.role} | ${entry.connections} | \`${entry.userId}\` |`),
  ].join("\n");
};

export const renderDiffMarkdown = (title: string, patch: string) =>
  [`# ${title}`, "", "```diff", patch.trimEnd(), "```"].join("\n");
