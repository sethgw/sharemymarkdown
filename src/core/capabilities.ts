export type Surface = "cli" | "mcp" | "web";

export type CapabilityGroup = "auth" | "documents" | "versions" | "revisions" | "sharing" | "collaboration";

export interface Capability {
  id: string;
  group: CapabilityGroup;
  title: string;
  description: string;
  surfaces: readonly Surface[];
}

export const primarySurface: Surface = "cli";

export const capabilityCatalog: Capability[] = [
  {
    id: "auth.login",
    group: "auth",
    title: "Log in",
    description: "Authenticate a user and establish a reusable local or browser session.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "auth.logout",
    group: "auth",
    title: "Log out",
    description: "Revoke the active session or token for the current surface.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "auth.whoami",
    group: "auth",
    title: "Current identity",
    description: "Resolve the current user and effective permissions.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "documents.list",
    group: "documents",
    title: "List documents",
    description: "Return the documents visible to the current user.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "documents.create",
    group: "documents",
    title: "Create document",
    description: "Create a new Markdown document and assign ownership.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "documents.get",
    group: "documents",
    title: "Read document",
    description: "Fetch the current document state and metadata.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "documents.edit",
    group: "documents",
    title: "Edit document",
    description: "Update Markdown content through the primary editing workflow for each surface.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "documents.share",
    group: "documents",
    title: "Create share link",
    description: "Create a document from Markdown and return a stable share URL.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "versions.list",
    group: "versions",
    title: "List versions",
    description: "Inspect saved document versions and their metadata.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "versions.create",
    group: "versions",
    title: "Save version",
    description: "Create a named version checkpoint for a document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "versions.diff",
    group: "versions",
    title: "Diff versions",
    description: "Compare two saved versions using readable Markdown diffs.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "versions.restore",
    group: "versions",
    title: "Restore version",
    description: "Restore a document to a prior saved version.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "revisions.list",
    group: "revisions",
    title: "List revisions",
    description: "Inspect draft and review revisions for a document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "revisions.create",
    group: "revisions",
    title: "Create revision",
    description: "Fork the live document into an isolated draft revision.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "revisions.edit",
    group: "revisions",
    title: "Edit revision",
    description: "Update a draft revision without changing the live document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "revisions.diff",
    group: "revisions",
    title: "Diff revision",
    description: "Compare a revision to its base snapshot or the current live document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "revisions.apply",
    group: "revisions",
    title: "Apply revision",
    description: "Promote a revision draft into the live document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "sharing.list",
    group: "sharing",
    title: "List members",
    description: "Inspect the collaborators and roles on a document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "sharing.visibility",
    group: "sharing",
    title: "Set visibility",
    description: "Change whether a document is private, unlisted, or public.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "sharing.grant",
    group: "sharing",
    title: "Grant access",
    description: "Add or update a collaborator role on a document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "sharing.revoke",
    group: "sharing",
    title: "Revoke access",
    description: "Remove a collaborator from a document.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "collaboration.presence",
    group: "collaboration",
    title: "Presence",
    description: "Show who is active in the document right now.",
    surfaces: ["cli", "mcp", "web"],
  },
  {
    id: "collaboration.realtime",
    group: "collaboration",
    title: "Realtime sync",
    description: "Synchronize concurrent edits through the Yjs collaboration layer.",
    surfaces: ["cli", "mcp", "web"],
  },
];

export const listCapabilitiesByGroup = () => {
  return capabilityCatalog.reduce<Record<CapabilityGroup, Capability[]>>(
    (groups, capability) => {
      groups[capability.group].push(capability);
      return groups;
    },
    {
      auth: [],
      documents: [],
      versions: [],
      revisions: [],
      sharing: [],
      collaboration: [],
    },
  );
};
