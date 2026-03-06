import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { CollaborativeMarkdownEditor } from "@/components/collaborative-markdown-editor";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/render-markdown";
import "./index.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionPayload = {
  session: {
    id: string;
    userId: string;
  } | null;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  } | null;
  githubConfigured: boolean;
  appUrl: string;
};

type DocumentVisibility = "private" | "unlisted" | "public";

type DocumentSummary = {
  id: string;
  title: string;
  role: string;
  updatedAt: string;
  visibility: DocumentVisibility;
  shareId: string;
  sharePath: string;
  shareUrl?: string;
};

type DocumentDetail = {
  id: string;
  title: string;
  role: "owner" | "editor" | "viewer";
  currentMarkdown: string;
  updatedAt: string;
  ownerId: string;
  visibility: DocumentVisibility;
  shareId: string;
  sharePath: string;
  shareUrl?: string;
};

type SharedDocumentDetail = Omit<DocumentDetail, "role"> & {
  role: "owner" | "editor" | "viewer" | null;
};

type Version = {
  id: string;
  parentVersionId: string | null;
  message: string;
  createdAt: string;
};

type RevisionSummary = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  status: "draft" | "review" | "applied";
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
};

type RevisionDetail = RevisionSummary & {
  baseMarkdown: string;
  markdown: string;
};

type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

type Presence = {
  userId: string;
  name: string;
  email: string;
  role: string;
  connections: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as { error?: string }).error ?? response.statusText);
  }

  return response.json() as Promise<T>;
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const readingStats = (markdown: string) => {
  const words = markdown
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return {
    words,
    readingMinutes: Math.max(1, Math.round(words / 238)),
  };
};

const visibilityCopy: Record<DocumentVisibility, string> = {
  private: "Only you and invited members can access this document.",
  unlisted: "Anyone with the link can read it, but it stays out of listings.",
  public: "Visible to everyone. Anyone can find and read it.",
};

const getDocumentShareUrl = (document: { sharePath?: string | null; shareUrl?: string | null }) => {
  if (document.shareUrl) return document.shareUrl;
  if (document.sharePath) return `${window.location.origin}${document.sharePath}`;
  return "";
};

const useCurrentPath = () => {
  const [path, setPath] = useState(window.location.pathname + window.location.search);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return path;
};

// ---------------------------------------------------------------------------
// Landing (standalone, no sidebar)
// ---------------------------------------------------------------------------

function Landing({ session }: { session: SessionPayload }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12">
      <div className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-600">Markdown for teams and agents</p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
          One document. Many collaborators. Humans and agents together.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-stone-600">
          Share Markdown between people, teams, and AI agents. Everyone edits the same document in realtime — from a browser, a CLI, or an MCP-connected agent.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_22rem] lg:items-start">
        <Card className="border-stone-200/80 bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Collaborative Markdown for humans and agents</CardTitle>
            <CardDescription>
              A shared workspace where people, teams, and AI agents co-author Markdown in realtime — from any surface.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Multi-surface access</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Work from the browser, CLI, or MCP. Agents and humans share the same documents and the same realtime session.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Shareable by default</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Every document gets a link. Share it with a teammate, an agent, or the world — you control the visibility.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Realtime co-editing</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Multiple cursors, live presence, and version history. People and agents edit side by side with full visibility.
                </p>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-stone-200 bg-[#fffdf8] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">How It Works</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">1. Create a document</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    From the browser, the CLI, or an MCP-connected agent. One command, one link.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">2. Invite collaborators</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Share the link with teammates or give an agent access. Everyone joins the same live session.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">3. Edit together</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Co-author in realtime. Save versions, propose revisions, and diff changes — all tracked.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-stone-200 bg-stone-950 px-5 py-4 text-stone-100">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">CLI Quick Start</p>
              <pre className="mt-3 overflow-x-auto text-sm leading-7 text-stone-100">{`$ bun add -g @sharemymarkdown/smm

$ smm share draft.md --visibility unlisted
https://sharemymarkdown.com/s/abc123

$ smm docs list
$ smm versions save <id> "first draft"
$ smm revisions create <id> "Fix intro"`}</pre>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200/80 bg-white/92 shadow-[0_20px_60px_rgba(28,25,23,0.08)]">
          <CardHeader>
            <CardTitle className="text-stone-950">{session.user ? `Welcome back, ${session.user.name}` : "Sign in to collaborate"}</CardTitle>
            <CardDescription className="text-stone-600">
              {session.githubConfigured
                ? "Sign in with GitHub to create, share, and co-edit documents."
                : "GitHub auth is not configured yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-600">
              {session.user
                ? "Your documents are accessible from the browser, CLI, and any MCP-connected agent."
                : "One account across every surface — browser, CLI, and MCP. Collaborate with people and agents alike."}
            </div>
            {session.user ? (
              <>
                <Button className="h-11 w-full bg-stone-950 text-white hover:bg-stone-800" onClick={() => window.location.assign("/dashboard")}>
                  Open dashboard
                </Button>
                <Button
                  className="h-11 w-full border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                  variant="outline"
                  onClick={() => window.location.assign("/auth/signout?callback=/")}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button
                className="h-11 w-full bg-stone-950 text-white hover:bg-stone-800"
                disabled={!session.githubConfigured}
                onClick={() => window.location.assign("/auth/github?callback=/dashboard")}
              >
                Continue with GitHub
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard content (within sidebar layout)
// ---------------------------------------------------------------------------

function DashboardContent({ session }: { session: SessionPayload }) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Documents</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome, {session.user?.name}</h2>
        <p className="max-w-md text-muted-foreground">
          Select a document from the sidebar or create a new one to get started.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Document content (within sidebar layout, viewer-hero)
// ---------------------------------------------------------------------------

function DocumentContent({
  documentId,
  session,
  onDocumentChanged,
}: {
  documentId: string;
  session: SessionPayload;
  onDocumentChanged?: () => void;
}) {
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [title, setTitle] = useState("");
  const [editorMarkdown, setEditorMarkdown] = useState("");
  const [editorStatus, setEditorStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [versionMessage, setVersionMessage] = useState("");
  const [newRevisionTitle, setNewRevisionTitle] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<RevisionDetail | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("viewer");
  const [diffText, setDiffText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [activePanel, setActivePanel] = useState<"versions" | "revisions" | "sharing" | null>(null);

  const canWrite = document?.role === "owner" || document?.role === "editor";
  const canManageSharing = document?.ownerId === session.user?.id;
  const isRevisionOwner = selectedRevision?.authorId === session.user?.id || document?.ownerId === session.user?.id;
  const shareUrl = document ? getDocumentShareUrl(document) : "";

  const togglePanel = (panel: "versions" | "revisions" | "sharing") =>
    setActivePanel((current) => (current === panel ? null : panel));

  const loadChrome = async (preserveRevisionId?: string | null) => {
    const [versionsResponse, revisionsResponse, membersResponse, presenceResponse] = await Promise.all([
      fetchJson<Version[]>(`/api/documents/${documentId}/versions`),
      fetchJson<RevisionSummary[]>(`/api/documents/${documentId}/revisions`),
      fetchJson<Member[]>(`/api/documents/${documentId}/members`),
      fetchJson<Presence[]>(`/api/documents/${documentId}/presence`),
    ]);

    setVersions(versionsResponse);
    setRevisions(revisionsResponse);
    setMembers(membersResponse);
    setPresence(presenceResponse);

    const nextRevisionId =
      preserveRevisionId && revisionsResponse.some((revision) => revision.id === preserveRevisionId)
        ? preserveRevisionId
        : revisionsResponse[0]?.id ?? null;

    setSelectedRevisionId(nextRevisionId);
  };

  const loadDocument = async (preserveRevisionId?: string | null) => {
    try {
      const documentResponse = await fetchJson<DocumentDetail>(`/api/documents/${documentId}`);
      setDocument(documentResponse);
      setTitle(documentResponse.title);
      setEditorMarkdown(documentResponse.currentMarkdown);
      await loadChrome(preserveRevisionId);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load document");
    }
  };

  useEffect(() => {
    void loadDocument(selectedRevisionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchJson<Presence[]>(`/api/documents/${documentId}/presence`)
        .then(setPresence)
        .catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [documentId]);

  useEffect(() => {
    if (!selectedRevisionId) {
      setSelectedRevision(null);
      return;
    }

    void fetchJson<RevisionDetail>(`/api/documents/${documentId}/revisions/${selectedRevisionId}`)
      .then((revision) => {
        setSelectedRevision(revision);
        setDiffText("");
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load revision");
      });
  }, [documentId, selectedRevisionId]);

  const deferredDocumentMarkdown = useDeferredValue(editorMarkdown);
  const deferredRevisionMarkdown = useDeferredValue(selectedRevision?.markdown ?? "");
  const documentPreviewHtml = useMemo(() => renderMarkdown(deferredDocumentMarkdown), [deferredDocumentMarkdown]);
  const revisionPreviewHtml = useMemo(() => renderMarkdown(deferredRevisionMarkdown), [deferredRevisionMarkdown]);
  const documentStats = useMemo(() => readingStats(editorMarkdown), [editorMarkdown]);

  const saveTitle = async () => {
    try {
      const response = await fetchJson<DocumentDetail>(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setDocument(response);
      setTitle(response.title);
      onDocumentChanged?.();
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to rename document");
    }
  };

  const saveVersion = async () => {
    try {
      await fetchJson(`/api/documents/${documentId}/versions`, {
        method: "POST",
        body: JSON.stringify({ message: versionMessage }),
      });
      setVersionMessage("");
      await loadChrome(selectedRevisionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save version");
    }
  };

  const updateVisibility = async (nextVisibility: DocumentVisibility) => {
    try {
      const response = await fetchJson<DocumentDetail>(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      setDocument(response);
      onDocumentChanged?.();
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update visibility");
    }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to copy the share link");
    }
  };

  const restore = async (versionId: string) => {
    try {
      const response = await fetchJson<DocumentDetail>(`/api/documents/${documentId}/restore/${versionId}`, {
        method: "POST",
      });
      setDocument(response);
      setTitle(response.title);
      setEditorMarkdown(response.currentMarkdown);
      await loadChrome(selectedRevisionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to restore version");
    }
  };

  const loadVersionDiff = async (fromVersionId: string, toVersionId: string) => {
    try {
      const response = await fetchJson<{ patch: string }>(
        `/api/documents/${documentId}/diff?from=${encodeURIComponent(fromVersionId)}&to=${encodeURIComponent(toVersionId)}`,
      );
      setDiffText(response.patch);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load diff");
    }
  };

  const createRevisionDraft = async () => {
    try {
      const revision = await fetchJson<RevisionDetail>(`/api/documents/${documentId}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          title: newRevisionTitle,
          markdown: editorMarkdown,
        }),
      });
      setNewRevisionTitle("");
      setSelectedRevisionId(revision.id);
      setSelectedRevision(revision);
      await loadChrome(revision.id);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create revision");
    }
  };

  const saveSelectedRevision = async () => {
    if (!selectedRevision) return;

    try {
      const revision = await fetchJson<RevisionDetail>(`/api/documents/${documentId}/revisions/${selectedRevision.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: selectedRevision.title,
          description: selectedRevision.description,
          markdown: selectedRevision.markdown,
          status: selectedRevision.status === "applied" ? "review" : selectedRevision.status,
        }),
      });
      setSelectedRevision(revision);
      await loadChrome(revision.id);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update revision");
    }
  };

  const loadRevisionDiff = async (compareTo: "base" | "live") => {
    if (!selectedRevision) return;

    try {
      const response = await fetchJson<{ patch: string }>(
        `/api/documents/${documentId}/revisions/${selectedRevision.id}/diff?compare=${compareTo}`,
      );
      setDiffText(response.patch);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load revision diff");
    }
  };

  const applySelectedRevision = async () => {
    if (!selectedRevision) return;

    try {
      const response = await fetchJson<DocumentDetail>(`/api/documents/${documentId}/revisions/${selectedRevision.id}/apply`, {
        method: "POST",
      });
      setDocument(response);
      setTitle(response.title);
      setEditorMarkdown(response.currentMarkdown);
      await loadChrome(selectedRevision.id);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to apply revision");
    }
  };

  const grantAccess = async () => {
    try {
      const response = await fetchJson<Member[]>(`/api/documents/${documentId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: shareEmail, role: shareRole }),
      });
      setMembers(response);
      setShareEmail("");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update sharing");
    }
  };

  const revokeAccess = async (userId: string) => {
    try {
      const response = await fetchJson<Member[]>(`/api/documents/${documentId}/members/${userId}`, {
        method: "DELETE",
      });
      setMembers(response);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update sharing");
    }
  };

  if (!document || !session.user) {
    return (
      <>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm text-muted-foreground">{error ?? "Loading document…"}</span>
        </header>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard">Documents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{document.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${
              editorStatus === "connected"
                ? "bg-emerald-500"
                : editorStatus === "connecting"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
            title={editorStatus}
          />
          {presence.length > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:block">
              {presence.length} online
            </span>
          )}
          <span className="hidden text-xs text-muted-foreground lg:block">
            {document.role} · {document.visibility}
          </span>
          {canWrite && (
            <Button size="sm" variant={editMode ? "default" : "outline"} onClick={() => setEditMode(!editMode)}>
              {editMode ? "Close editor" : "Edit"}
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Words</p>
            <p className="text-lg font-semibold">{documentStats.words}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Reading Time</p>
            <p className="text-lg font-semibold">{documentStats.readingMinutes} min</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-lg font-semibold">{presence.length}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Versions</p>
            <p className="text-lg font-semibold">{versions.length}</p>
          </div>
        </div>

        {/* Editor panel (when active) */}
        {editMode && (
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <Input className="h-8 max-w-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => void saveTitle()}>
                Rename
              </Button>
              <div className="flex-1" />
              <Input
                className="h-8 w-48"
                placeholder="Version message"
                value={versionMessage}
                onChange={(e) => setVersionMessage(e.target.value)}
              />
              <Button size="sm" disabled={!canWrite} onClick={() => void saveVersion()}>
                Save version
              </Button>
            </div>
            <CollaborativeMarkdownEditor
              key={documentId}
              documentId={documentId}
              initialMarkdown={document.currentMarkdown}
              user={session.user}
              readOnly={!canWrite}
              onStatusChange={setEditorStatus}
              onMarkdownChange={(markdown) => {
                setEditorMarkdown(markdown);
                setDocument((current) =>
                  current
                    ? {
                        ...current,
                        currentMarkdown: markdown,
                        updatedAt: new Date().toISOString(),
                      }
                    : current,
                );
              }}
            />
          </Card>
        )}

        {/* HERO: Rendered markdown viewer */}
        <Card className="flex-1">
          <div className="p-6 md:p-8 lg:p-10">
            <article
              className="markdown-body prose prose-stone mx-auto max-w-3xl text-[15px] leading-7"
              dangerouslySetInnerHTML={{ __html: documentPreviewHtml }}
            />
            {!editorMarkdown.trim() && (
              <p className="mx-auto max-w-3xl text-sm text-muted-foreground">
                This document is empty.{" "}
                {canWrite && !editMode && (
                  <button className="underline" onClick={() => setEditMode(true)}>
                    Open the editor
                  </button>
                )}
              </p>
            )}
          </div>
        </Card>

        {/* Panel toggle bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void copyShareUrl()}>
            Copy link
          </Button>
          <Button
            size="sm"
            variant={activePanel === "versions" ? "default" : "outline"}
            onClick={() => togglePanel("versions")}
          >
            Versions ({versions.length})
          </Button>
          <Button
            size="sm"
            variant={activePanel === "revisions" ? "default" : "outline"}
            onClick={() => togglePanel("revisions")}
          >
            Revisions ({revisions.length})
          </Button>
          <Button
            size="sm"
            variant={activePanel === "sharing" ? "default" : "outline"}
            onClick={() => togglePanel("sharing")}
          >
            Sharing
          </Button>
        </div>

        {/* Versions panel */}
        {activePanel === "versions" && (
          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
              <CardDescription>Explicit checkpoints for rollback and stable diffs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Version message"
                  value={versionMessage}
                  onChange={(e) => setVersionMessage(e.target.value)}
                />
                <Button disabled={!canWrite} onClick={() => void saveVersion()}>
                  Save
                </Button>
              </div>
              {versions.length === 0 && <p className="text-sm text-muted-foreground">No versions saved yet.</p>}
              {versions.map((version) => (
                <div key={version.id} className="rounded-lg border p-3">
                  <p className="font-medium">{version.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(version.createdAt)}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" disabled={!canWrite} onClick={() => void restore(version.id)}>
                      Restore
                    </Button>
                    {version.parentVersionId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void loadVersionDiff(version.parentVersionId!, version.id)}
                      >
                        Diff
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Revisions panel */}
        {activePanel === "revisions" && (
          <Card>
            <CardHeader>
              <CardTitle>Revisions</CardTitle>
              <CardDescription>
                Create reviewable alternatives without mutating the live document.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Revision title"
                  value={newRevisionTitle}
                  onChange={(e) => setNewRevisionTitle(e.target.value)}
                />
                <Button disabled={!canWrite} onClick={() => void createRevisionDraft()}>
                  Create
                </Button>
              </div>
              {revisions.length === 0 && <p className="text-sm text-muted-foreground">No revisions yet.</p>}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {revisions.map((revision) => (
                  <button
                    key={revision.id}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selectedRevisionId === revision.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-foreground"
                    }`}
                    onClick={() => setSelectedRevisionId(revision.id)}
                  >
                    <p className="font-medium">{revision.title}</p>
                    <p className="mt-0.5 text-xs opacity-70">
                      {revision.status} · {formatDate(revision.updatedAt)}
                    </p>
                  </button>
                ))}
              </div>
              {selectedRevision && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="max-w-xs"
                      value={selectedRevision.title}
                      onChange={(e) =>
                        setSelectedRevision((c) => (c ? { ...c, title: e.target.value } : c))
                      }
                      disabled={!isRevisionOwner}
                    />
                    <select
                      className="h-9 rounded-md border px-2 text-sm"
                      value={selectedRevision.status}
                      disabled={!isRevisionOwner || selectedRevision.status === "applied"}
                      onChange={(e) =>
                        setSelectedRevision((c) =>
                          c && e.target.value !== "applied"
                            ? { ...c, status: e.target.value as "draft" | "review" }
                            : c,
                        )
                      }
                    >
                      <option value="draft">draft</option>
                      <option value="review">review</option>
                      <option value="applied">applied</option>
                    </select>
                  </div>
                  <Textarea
                    className="min-h-20"
                    value={selectedRevision.description}
                    onChange={(e) =>
                      setSelectedRevision((c) => (c ? { ...c, description: e.target.value } : c))
                    }
                    disabled={!isRevisionOwner}
                    placeholder="What changed and why?"
                  />
                  <Textarea
                    className="min-h-[16rem] font-mono text-sm"
                    value={selectedRevision.markdown}
                    onChange={(e) =>
                      setSelectedRevision((c) => (c ? { ...c, markdown: e.target.value } : c))
                    }
                    disabled={!isRevisionOwner}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={!isRevisionOwner} onClick={() => void saveSelectedRevision()}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void loadRevisionDiff("live")}>
                      Diff vs live
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void loadRevisionDiff("base")}>
                      Diff vs base
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!isRevisionOwner || !canWrite}
                      onClick={() => void applySelectedRevision()}
                    >
                      Apply
                    </Button>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="mb-2 text-xs text-muted-foreground">Revision preview</p>
                    <article
                      className="markdown-body prose prose-stone max-w-none text-sm leading-7"
                      dangerouslySetInnerHTML={{ __html: revisionPreviewHtml }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sharing panel */}
        {activePanel === "sharing" && (
          <Card>
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
              <CardDescription>Control visibility, share links, and manage collaborator access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs text-muted-foreground">Share Link</p>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => void copyShareUrl()}>
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                  >
                    Open
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs text-muted-foreground">Visibility</p>
                <select
                  className="h-9 w-full rounded-md border px-2 text-sm"
                  value={document.visibility}
                  disabled={!canManageSharing}
                  onChange={(e) => void updateVisibility(e.target.value as DocumentVisibility)}
                >
                  <option value="private">private</option>
                  <option value="unlisted">unlisted</option>
                  <option value="public">public</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{visibilityCopy[document.visibility]}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs text-muted-foreground">Add Member</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    disabled={!canManageSharing}
                  />
                  <select
                    className="h-9 rounded-md border px-2 text-sm"
                    value={shareRole}
                    disabled={!canManageSharing}
                    onChange={(e) => setShareRole(e.target.value as "viewer" | "editor")}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                  <Button size="sm" disabled={!canManageSharing} onClick={() => void grantAccess()}>
                    Add
                  </Button>
                </div>
              </div>
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.email} · {member.role}
                    </p>
                  </div>
                  {member.role !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canManageSharing}
                      onClick={() => void revokeAccess(member.userId)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {presence.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Online Now</p>
                  {presence.map((entry) => (
                    <div key={entry.userId} className="flex items-center gap-2 py-1">
                      <div className="size-2 rounded-full bg-emerald-500" />
                      <span className="text-sm">{entry.name}</span>
                      <span className="text-xs text-muted-foreground">{entry.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Diff display */}
        {diffText && (
          <Card className="bg-stone-950 text-stone-100">
            <CardHeader>
              <CardTitle>Diff</CardTitle>
              <CardDescription className="text-stone-400">
                Readable patch output shared with the CLI and MCP tools.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6">{diffText}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared document (within sidebar layout, for authenticated users)
// ---------------------------------------------------------------------------

function SharedDocumentContent({
  shareId,
  session,
}: {
  shareId: string;
  session: SessionPayload;
}) {
  const [document, setDocument] = useState<SharedDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<SharedDocumentDetail>(`/api/shared/${shareId}`)
      .then((response) => {
        setDocument(response);
        setError(null);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load shared document");
      });
  }, [shareId, session.user?.id]);

  const deferredMarkdown = useDeferredValue(document?.currentMarkdown ?? "");
  const previewHtml = useMemo(() => renderMarkdown(deferredMarkdown), [deferredMarkdown]);
  const stats = useMemo(() => readingStats(document?.currentMarkdown ?? ""), [document?.currentMarkdown]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard">Documents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{document?.title ?? "Shared document"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          {document && (
            <span className="hidden text-xs text-muted-foreground sm:block">
              {stats.words} words · {stats.readingMinutes} min read
            </span>
          )}
          {document?.role && (
            <Button size="sm" onClick={() => window.location.assign(`/documents/${document.id}`)}>
              Open workspace
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {document ? (
          <>
            <Card className="flex-1">
              <div className="p-6 md:p-8 lg:p-10">
                <article
                  className="markdown-body prose prose-stone mx-auto max-w-3xl text-[15px] leading-7"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Link details</CardTitle>
                <CardDescription>{visibilityCopy[document.visibility]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={getDocumentShareUrl(document)} readOnly className="text-xs" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(getDocumentShareUrl(document)).catch(() => {})}
                  >
                    Copy
                  </Button>
                </div>
                {document.role && (
                  <p className="text-sm text-muted-foreground">
                    You have {document.role} access on this document.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{error ? "" : "Loading…"}</p>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared document standalone (unauthenticated viewers)
// ---------------------------------------------------------------------------

function SharedDocumentStandalone({
  shareId,
  session,
}: {
  shareId: string;
  session: SessionPayload;
}) {
  const [document, setDocument] = useState<SharedDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<SharedDocumentDetail>(`/api/shared/${shareId}`)
      .then((response) => {
        setDocument(response);
        setError(null);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load shared document");
      });
  }, [shareId]);

  const deferredMarkdown = useDeferredValue(document?.currentMarkdown ?? "");
  const previewHtml = useMemo(() => renderMarkdown(deferredMarkdown), [deferredMarkdown]);
  const stats = useMemo(() => readingStats(document?.currentMarkdown ?? ""), [document?.currentMarkdown]);

  if (!document) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <header className="mb-8 border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">{document.title}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{stats.words} words</span>
          <span>{stats.readingMinutes} min read</span>
          <span>Updated {formatDate(document.updatedAt)}</span>
        </div>
      </header>
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <article
        className="markdown-body prose prose-stone mx-auto max-w-3xl text-[15px] leading-7"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
      <div className="mt-10 border-t border-stone-200 pt-6">
        <Button
          disabled={!session.githubConfigured}
          onClick={() =>
            window.location.assign(
              `/auth/github?callback=${encodeURIComponent(window.location.pathname + window.location.search)}`,
            )
          }
        >
          Sign in to collaborate
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLI login page (standalone)
// ---------------------------------------------------------------------------

function CliLoginPage({
  session,
  requestId,
}: {
  session: SessionPayload;
  requestId: string | null;
}) {
  const [status, setStatus] = useState("Waiting for sign-in");
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (!session.user || !requestId || isCompleting) return;

    setIsCompleting(true);
    setStatus("Finishing CLI login");

    void fetchJson(`/api/cli-login/${requestId}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then(() => setStatus("CLI login complete. You can return to the terminal."))
      .catch((requestError) => setStatus(requestError instanceof Error ? requestError.message : "Unable to complete CLI login"))
      .finally(() => setIsCompleting(false));
  }, [isCompleting, requestId, session.user]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6 py-10">
      <Card className="w-full border-stone-200/80 bg-white/85">
        <CardHeader>
          <CardTitle>CLI Login</CardTitle>
          <CardDescription>Use GitHub in the browser, then pass the session token back to the CLI.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!requestId ? <p className="text-sm text-red-700">Missing CLI login request id.</p> : null}
          <p className="text-sm text-stone-700">{status}</p>
          {!session.user ? (
            <Button
              disabled={!session.githubConfigured}
              onClick={() =>
                window.location.assign(
                  `/auth/github?callback=${encodeURIComponent(window.location.pathname + window.location.search)}`,
                )
              }
            >
              Continue with GitHub
            </Button>
          ) : null}
          {session.user ? <p className="text-sm text-stone-600">Signed in as {session.user.email}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authenticated app (sidebar layout wrapper)
// ---------------------------------------------------------------------------

type Route =
  | { type: "dashboard" }
  | { type: "document"; documentId: string | null }
  | { type: "shared-document"; shareId: string | null };

function AuthenticatedApp({ session, route }: { session: SessionPayload; route: Route }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  const loadDocuments = async () => {
    try {
      setDocuments(await fetchJson<DocumentSummary[]>("/api/documents"));
    } catch {
      // sidebar will show empty
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const createDocument = async () => {
    try {
      const doc = await fetchJson<DocumentDetail>("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: "", visibility: "unlisted" }),
      });
      window.location.assign(`/documents/${doc.id}`);
    } catch {
      // will show error on the new page
    }
  };

  const activeDocId = route.type === "document" ? route.documentId : null;

  return (
    <SidebarProvider>
      <AppSidebar
        documents={documents}
        activeDocumentId={activeDocId}
        user={session.user}
        onCreateDocument={() => void createDocument()}
      />
      <SidebarInset>
        {route.type === "dashboard" && <DashboardContent session={session} />}
        {route.type === "document" && route.documentId && (
          <DocumentContent
            documentId={route.documentId}
            session={session}
            onDocumentChanged={() => void loadDocuments()}
          />
        )}
        {route.type === "shared-document" && route.shareId && (
          <SharedDocumentContent shareId={route.shareId} session={session} />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

export function App() {
  const path = useCurrentPath();
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    void fetchJson<SessionPayload>("/api/session")
      .then(setSession)
      .catch(() =>
        setSession({
          session: null,
          user: null,
          githubConfigured: false,
          appUrl: window.location.origin,
        }),
      );
  }, []);

  const route = useMemo(() => {
    const url = new URL(path, window.location.origin);

    if (url.pathname.startsWith("/documents/")) {
      return { type: "document" as const, documentId: url.pathname.split("/")[2] ?? null };
    }

    if (url.pathname.startsWith("/d/")) {
      return { type: "shared-document" as const, shareId: url.pathname.split("/")[2] ?? null };
    }

    if (url.pathname === "/dashboard") {
      return { type: "dashboard" as const };
    }

    if (url.pathname === "/cli/login") {
      return {
        type: "cli-login" as const,
        requestId: url.searchParams.get("requestId"),
      };
    }

    if (url.pathname === "/mcp/login") {
      return { type: "mcp-login" as const };
    }

    return { type: "landing" as const };
  }, [path]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-stone-600">Loading ShareMyMarkdown…</p>
      </div>
    );
  }

  // Standalone pages (no sidebar)
  if (route.type === "cli-login") {
    return <CliLoginPage session={session} requestId={route.requestId} />;
  }

  if (route.type === "mcp-login") {
    return null; // handled server-side
  }

  // Shared document: sidebar for authenticated, standalone for anonymous
  if (route.type === "shared-document") {
    if (session.user) {
      return <AuthenticatedApp session={session} route={route} />;
    }
    return <SharedDocumentStandalone shareId={route.shareId ?? ""} session={session} />;
  }

  // Landing page for unauthenticated, redirect to dashboard for authenticated
  if (route.type === "landing") {
    if (session.user) {
      return <AuthenticatedApp session={session} route={{ type: "dashboard" }} />;
    }
    return <Landing session={session} />;
  }

  // Authenticated routes
  if (!session.user) {
    window.location.assign("/");
    return null;
  }

  return <AuthenticatedApp session={session} route={route} />;
}

export default App;
