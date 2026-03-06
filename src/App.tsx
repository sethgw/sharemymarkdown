import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { CollaborativeMarkdownEditor } from "@/components/collaborative-markdown-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/render-markdown";
import "./index.css";

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

const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const readingStats = (markdown: string) => {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(words / 220));
  return {
    words,
    readingMinutes,
  };
};

const visibilityCopy: Record<DocumentVisibility, string> = {
  private: "Only explicit members can open the document.",
  unlisted: "Anyone with the link can read it, but it stays out of listings.",
  public: "Anyone can read the document without a private link.",
};

const getDocumentShareUrl = (document: { shareUrl?: string; sharePath: string }) =>
  document.shareUrl ?? new URL(document.sharePath, window.location.origin).toString();

const useCurrentPath = () => {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return path;
};

function Landing({ session }: { session: SessionPayload }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12">
      <div className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-600">Collaborative Markdown</p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
          Write, share, and collaborate on Markdown without the overhead.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-stone-600">
          Create a document, get a shareable link, and collaborate in realtime. Works from the browser, CLI, or your favorite AI agent.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_22rem] lg:items-start">
        <Card className="border-stone-200/80 bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Share Markdown, Not Screenshots</CardTitle>
            <CardDescription>
              Turn any draft into a clean, shareable link. Choose who can see it, edit together in realtime, and keep a full version history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Instant sharing</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Publish any Markdown draft and get a shareable link in seconds. No signup wall for readers.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Your rules</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Set a document to private, unlisted, or public. Control who can read and who can edit.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-900">Realtime collaboration</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Edit together live with presence indicators. Save versions and create revision drafts before merging changes.
                </p>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-stone-200 bg-[#fffdf8] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">How It Works</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">1. Write your draft</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Start in any editor, terminal, or AI assistant. Write Markdown the way you already do.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">2. Share it</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Create a document on ShareMyMarkdown and get a link you can send to anyone.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">3. Collaborate</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Edit together in the browser, save versions, and review changes before they go live.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-stone-200 bg-stone-950 px-5 py-4 text-stone-100">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">CLI Quick Start</p>
              <pre className="mt-3 overflow-x-auto text-sm leading-7 text-stone-100">{`sharemymarkdown share draft.md --visibility unlisted
# alias
smm share draft.md --visibility unlisted`}</pre>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200/80 bg-white/92 shadow-[0_20px_60px_rgba(28,25,23,0.08)]">
          <CardHeader>
            <CardTitle className="text-stone-950">{session.user ? `Welcome back, ${session.user.name}` : "Sign in to start sharing"}</CardTitle>
            <CardDescription className="text-stone-600">
              {session.githubConfigured
                ? "Sign in with GitHub to create and manage your documents."
                : "GitHub auth is not configured yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-600">
              {session.user
                ? "Your documents are available in the browser, CLI, and through MCP with the same account."
                : "One account for everything. Create documents in the browser, share from the CLI, or connect through MCP."}
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

function Dashboard({ session }: { session: SessionPayload }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<DocumentVisibility>("private");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      setDocuments(await fetchJson<DocumentSummary[]>("/api/documents"));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const createNewDocument = async () => {
    try {
      const document = await fetchJson<DocumentDetail>("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title, visibility }),
      });
      window.location.assign(`/documents/${document.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create document");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-stone-500">Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">{session.user?.name}&apos;s documents</h1>
          <p className="mt-2 text-stone-600">Your Markdown documents, all in one place.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.assign("/auth/signout?callback=/")}>
            Sign out
          </Button>
        </div>
      </header>

      <Card className="border-stone-200/80 bg-white/80">
        <CardHeader>
          <CardTitle>Create document</CardTitle>
          <CardDescription>Titles are lightweight. The content can be filled in from the live editor or CLI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="Untitled design doc" value={title} onChange={event => setTitle(event.target.value)} />
          <select
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm"
            value={visibility}
            onChange={event => setVisibility(event.target.value as DocumentVisibility)}
          >
            <option value="private">private</option>
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
          </select>
          <Button onClick={() => void createNewDocument()}>Create</Button>
        </CardContent>
      </Card>

      <Card className="border-stone-200/80 bg-white/80">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>{isLoading ? "Loading..." : `${documents.length} document${documents.length === 1 ? "" : "s"}`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {!isLoading && documents.length === 0 ? <p className="text-sm text-stone-600">No documents yet.</p> : null}
          {documents.map(document => (
            <button
              key={document.id}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-left transition hover:border-stone-900"
              onClick={() => window.location.assign(`/documents/${document.id}`)}
            >
              <span>
                <span className="block font-medium text-stone-900">{document.title}</span>
                <span className="mt-1 block text-sm text-stone-600">
                  {document.role} • {document.visibility} • updated {formatDate(document.updatedAt)}
                </span>
              </span>
              <span className="text-sm text-stone-500">{document.id.slice(0, 8)}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentPage({
  documentId,
  session,
}: {
  documentId: string;
  session: SessionPayload;
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

  const canWrite = document?.role === "owner" || document?.role === "editor";
  const canManageSharing = document?.ownerId === session.user?.id;
  const isRevisionOwner = selectedRevision?.authorId === session.user?.id || document?.ownerId === session.user?.id;
  const shareUrl = document ? getDocumentShareUrl(document) : "";

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
      preserveRevisionId && revisionsResponse.some(revision => revision.id === preserveRevisionId)
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
      .then(revision => {
        setSelectedRevision(revision);
        setDiffText("");
      })
      .catch(requestError => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load revision");
      });
  }, [documentId, selectedRevisionId]);

  const deferredDocumentMarkdown = useDeferredValue(editorMarkdown);
  const deferredRevisionMarkdown = useDeferredValue(selectedRevision?.markdown ?? "");

  const documentPreviewHtml = useMemo(() => renderMarkdown(deferredDocumentMarkdown), [deferredDocumentMarkdown]);
  const revisionPreviewHtml = useMemo(() => renderMarkdown(deferredRevisionMarkdown), [deferredRevisionMarkdown]);
  const documentStats = useMemo(() => readingStats(editorMarkdown), [editorMarkdown]);
  const revisionStats = useMemo(() => readingStats(selectedRevision?.markdown ?? ""), [selectedRevision?.markdown]);

  const saveTitle = async () => {
    try {
      const response = await fetchJson<DocumentDetail>(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setDocument(response);
      setTitle(response.title);
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
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
        <Card className="w-full max-w-xl border-stone-200/80 bg-white/80">
          <CardHeader>
            <CardTitle>Loading document</CardTitle>
            <CardDescription>{error ?? "Fetching current content, presence, revisions, versions, and members."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.22em] text-stone-500">Document</p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900">{document.title}</h1>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{document.role}</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{document.visibility}</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{editorStatus}</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{presence.length} active</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">Updated {formatDate(document.updatedAt)}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </header>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.7fr)]">
        <div className="space-y-6">
          <Card className="border-stone-200/80 bg-white/80">
            <CardHeader>
              <CardTitle>Live document</CardTitle>
              <CardDescription>
                {canWrite ? "Realtime editing is live. Versions and revisions stay separate so review remains readable." : "Viewer mode keeps the live doc read-only while preserving preview and history access."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row">
                <Input value={title} onChange={event => setTitle(event.target.value)} />
                <Button onClick={() => void saveTitle()}>Save title</Button>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                    <span>{canWrite ? "Collaborative writing surface" : "Read-only collaborative surface"}</span>
                    <span>{documentStats.words} words</span>
                  </div>
                  <CollaborativeMarkdownEditor
                    key={documentId}
                    documentId={documentId}
                    initialMarkdown={document.currentMarkdown}
                    user={session.user}
                    readOnly={!canWrite}
                    onStatusChange={setEditorStatus}
                    onMarkdownChange={markdown => {
                      setEditorMarkdown(markdown);
                      setDocument(current =>
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
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Reading Time</p>
                      <p className="mt-2 text-2xl font-semibold text-stone-900">{documentStats.readingMinutes} min</p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Words</p>
                      <p className="mt-2 text-2xl font-semibold text-stone-900">{documentStats.words}</p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Presence</p>
                      <p className="mt-2 text-2xl font-semibold text-stone-900">{presence.length}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Reading View</p>
                        <p className="mt-1 text-sm text-stone-600">Rendered Markdown optimized for review.</p>
                      </div>
                    </div>
                    <article
                      className="markdown-body prose prose-stone max-w-none text-[15px] leading-7"
                      dangerouslySetInnerHTML={{ __html: documentPreviewHtml }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedRevision ? (
            <Card className="border-stone-200/80 bg-white/80">
              <CardHeader>
                <CardTitle>Revision draft</CardTitle>
                <CardDescription>
                  Drafts are separate from the live doc. You can shape language, compare it to base or live content, and only apply when it is ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <Input
                        value={selectedRevision.title}
                        onChange={event =>
                          setSelectedRevision(current => (current ? { ...current, title: event.target.value } : current))
                        }
                        disabled={!isRevisionOwner}
                      />
                      <select
                        className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm"
                        value={selectedRevision.status}
                        onChange={event =>
                          setSelectedRevision(current =>
                            current && event.target.value !== "applied"
                              ? { ...current, status: event.target.value as "draft" | "review" }
                              : current,
                          )
                        }
                        disabled={!isRevisionOwner || selectedRevision.status === "applied"}
                      >
                        <option value="draft">draft</option>
                        <option value="review">review</option>
                        <option value="applied">applied</option>
                      </select>
                    </div>

                    <Textarea
                      className="min-h-28"
                      value={selectedRevision.description}
                      onChange={event =>
                        setSelectedRevision(current => (current ? { ...current, description: event.target.value } : current))
                      }
                      disabled={!isRevisionOwner}
                      placeholder="What changed and why?"
                    />

                    <Textarea
                      className="min-h-[24rem] font-mono text-sm"
                      value={selectedRevision.markdown}
                      onChange={event =>
                        setSelectedRevision(current => (current ? { ...current, markdown: event.target.value } : current))
                      }
                      disabled={!isRevisionOwner}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!isRevisionOwner} onClick={() => void saveSelectedRevision()}>
                        Save draft
                      </Button>
                      <Button variant="outline" onClick={() => void loadRevisionDiff("live")}>
                        Diff vs live
                      </Button>
                      <Button variant="outline" onClick={() => void loadRevisionDiff("base")}>
                        Diff vs base
                      </Button>
                      <Button disabled={!isRevisionOwner || !canWrite} variant="secondary" onClick={() => void applySelectedRevision()}>
                        Apply revision
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Revision Words</p>
                        <p className="mt-2 text-2xl font-semibold text-stone-900">{revisionStats.words}</p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Reading Time</p>
                        <p className="mt-2 text-2xl font-semibold text-stone-900">{revisionStats.readingMinutes} min</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-5">
                      <div className="mb-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Revision Preview</p>
                        <p className="mt-1 text-sm text-stone-600">This preview is isolated from the live doc.</p>
                      </div>
                      <article
                        className="markdown-body prose prose-stone max-w-none text-[15px] leading-7"
                        dangerouslySetInnerHTML={{ __html: revisionPreviewHtml }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {diffText ? (
            <Card className="border-stone-200/80 bg-stone-950 text-stone-100">
              <CardHeader>
                <CardTitle>Diff</CardTitle>
                <CardDescription className="text-stone-400">Readable patch output shared with the CLI and MCP tools.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-stone-800 bg-black/25 p-4 text-xs leading-6">
                  {diffText}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="border-stone-200/80 bg-white/80">
            <CardHeader>
              <CardTitle>Version history</CardTitle>
              <CardDescription>Explicit checkpoints for rollback, release notes, and stable diffs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Version message" value={versionMessage} onChange={event => setVersionMessage(event.target.value)} />
              <Button className="w-full" disabled={!canWrite} onClick={() => void saveVersion()}>
                Save version
              </Button>
              <div className="space-y-2">
                {versions.map(version => (
                  <div key={version.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                    <p className="font-medium text-stone-900">{version.message}</p>
                    <p className="mt-1 text-xs text-stone-600">{formatDate(version.createdAt)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={!canWrite} onClick={() => void restore(version.id)}>
                        Restore
                      </Button>
                      {version.parentVersionId ? (
                        <Button size="sm" variant="ghost" onClick={() => void loadVersionDiff(version.parentVersionId!, version.id)}>
                          Diff vs parent
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200/80 bg-white/80">
            <CardHeader>
              <CardTitle>Drafts and revisions</CardTitle>
              <CardDescription>Create reviewable alternatives without mutating the live document.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3">
                <Input placeholder="Revision title" value={newRevisionTitle} onChange={event => setNewRevisionTitle(event.target.value)} />
                <Button className="w-full" disabled={!canWrite} onClick={() => void createRevisionDraft()}>
                  Create revision from live doc
                </Button>
              </div>
              <div className="space-y-2">
                {revisions.length === 0 ? <p className="text-sm text-stone-600">No revisions yet.</p> : null}
                {revisions.map(revision => (
                  <button
                    key={revision.id}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedRevisionId === revision.id
                        ? "border-stone-900 bg-stone-950 text-white"
                        : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-900"
                    }`}
                    onClick={() => setSelectedRevisionId(revision.id)}
                  >
                    <p className="font-medium">{revision.title}</p>
                    <p className={`mt-1 text-xs ${selectedRevisionId === revision.id ? "text-stone-300" : "text-stone-600"}`}>
                      {revision.status} • updated {formatDate(revision.updatedAt)}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200/80 bg-white/80">
            <CardHeader>
              <CardTitle>Presence</CardTitle>
              <CardDescription>Who is actively connected to this document right now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {presence.length === 0 ? <p className="text-sm text-stone-600">No active collaborators.</p> : null}
              {presence.map(entry => (
                <div key={entry.userId} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="font-medium text-stone-900">{entry.name}</p>
                  <p className="mt-1 text-xs text-stone-600">
                    {entry.role} • {entry.connections} connection{entry.connections === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-stone-200/80 bg-white/80">
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
              <CardDescription>Owners can tune visibility, copy the stable share link, and add editors or viewers by email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Share Link</p>
                <div className="mt-3 flex flex-col gap-3">
                  <Input value={shareUrl} readOnly />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void copyShareUrl()}>
                      Copy link
                    </Button>
                    <Button variant="outline" onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}>
                      Open shared page
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Visibility</p>
                <div className="mt-3 flex flex-col gap-3">
                  <select
                    className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                    value={document.visibility}
                    disabled={!canManageSharing}
                    onChange={event => void updateVisibility(event.target.value as DocumentVisibility)}
                  >
                    <option value="private">private</option>
                    <option value="unlisted">unlisted</option>
                    <option value="public">public</option>
                  </select>
                  <p className="text-sm leading-6 text-stone-600">{visibilityCopy[document.visibility]}</p>
                </div>
              </div>

              <Input
                placeholder="teammate@example.com"
                value={shareEmail}
                onChange={event => setShareEmail(event.target.value)}
                disabled={!canManageSharing}
              />
              <select
                className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                value={shareRole}
                disabled={!canManageSharing}
                onChange={event => setShareRole(event.target.value as "viewer" | "editor")}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
              </select>
              <Button className="w-full" disabled={!canManageSharing} onClick={() => void grantAccess()}>
                Grant access
              </Button>
              <div className="space-y-2">
                {members.map(member => (
                  <div key={member.userId} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3">
                    <div>
                      <p className="font-medium text-stone-900">{member.name}</p>
                      <p className="text-xs text-stone-600">
                        {member.email} • {member.role}
                      </p>
                    </div>
                    {member.role !== "owner" ? (
                      <Button size="sm" variant="ghost" disabled={!canManageSharing} onClick={() => void revokeAccess(member.userId)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SharedDocumentPage({
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
      .then(response => {
        setDocument(response);
        setError(null);
      })
      .catch(requestError => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load shared document");
      });
  }, [shareId, session.user?.id]);

  const deferredMarkdown = useDeferredValue(document?.currentMarkdown ?? "");
  const previewHtml = useMemo(() => renderMarkdown(deferredMarkdown), [deferredMarkdown]);
  const stats = useMemo(() => readingStats(document?.currentMarkdown ?? ""), [document?.currentMarkdown]);

  if (!document) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
        <Card className="w-full border-stone-200/80 bg-white/85">
          <CardHeader>
            <CardTitle>Shared document</CardTitle>
            <CardDescription>{error ?? "Loading the reading view."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const shareUrl = getDocumentShareUrl(document);
  const signInCallback = encodeURIComponent(window.location.pathname + window.location.search);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-stone-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.22em] text-stone-500">Shared Document</p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900">{document.title}</h1>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{document.visibility}</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{stats.words} words</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{stats.readingMinutes} min read</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">Updated {formatDate(document.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {document.role ? (
            <Button onClick={() => window.location.assign(`/documents/${document.id}`)}>Open workspace</Button>
          ) : session.user ? (
            <div className="max-w-sm rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
              You can read this document through the link. Ask the owner for viewer or editor access if you need the live workspace.
            </div>
          ) : (
            <Button
              disabled={!session.githubConfigured}
              onClick={() => window.location.assign(`/auth/github?callback=${signInCallback}`)}
            >
              Sign in to collaborate
            </Button>
          )}
        </div>
      </header>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card className="border-stone-200/80 bg-white/85">
          <CardHeader>
            <CardTitle>Reading View</CardTitle>
            <CardDescription>Shared links resolve to a reading-first page so the Markdown stays easy to review.</CardDescription>
          </CardHeader>
          <CardContent>
            <article
              className="markdown-body prose prose-stone max-w-none text-[15px] leading-7"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-stone-200/80 bg-white/85">
            <CardHeader>
              <CardTitle>Link details</CardTitle>
              <CardDescription>{visibilityCopy[document.visibility]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={shareUrl} readOnly />
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(shareUrl).catch(() => {
                    setError("Unable to copy the share link");
                  })
                }
              >
                Copy link
              </Button>
              {document.role ? (
                <p className="text-sm leading-6 text-stone-600">You already have {document.role} access on this document.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-stone-200/80 bg-white/85">
            <CardHeader>
              <CardTitle>Markdown</CardTitle>
              <CardDescription>Useful when you need to move the exact text back into an agent or editor.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea className="min-h-[22rem] font-mono text-sm" readOnly value={document.currentMarkdown} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

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
      .catch(error => setStatus(error instanceof Error ? error.message : "Unable to complete CLI login"))
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
            <Button disabled={!session.githubConfigured} onClick={() => window.location.assign(`/auth/github?callback=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>
              Continue with GitHub
            </Button>
          ) : null}
          {session.user ? <p className="text-sm text-stone-600">Signed in as {session.user.email}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

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
      return {
        type: "document" as const,
        documentId: url.pathname.split("/")[2] ?? null,
      };
    }

    if (url.pathname.startsWith("/d/")) {
      return {
        type: "shared-document" as const,
        shareId: url.pathname.split("/")[2] ?? null,
      };
    }

    if (url.pathname === "/dashboard") {
      return {
        type: "dashboard" as const,
      };
    }

    if (url.pathname === "/cli/login") {
      return {
        type: "cli-login" as const,
        requestId: url.searchParams.get("requestId"),
      };
    }

    return {
      type: "landing" as const,
    };
  }, [path]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-stone-600">Loading ShareMyMarkdown…</p>
      </div>
    );
  }

  if (route.type === "dashboard") {
    if (!session.user) {
      window.location.assign("/");
      return null;
    }

    return <Dashboard session={session} />;
  }

  if (route.type === "document" && route.documentId) {
    if (!session.user) {
      window.location.assign("/");
      return null;
    }

    return <DocumentPage documentId={route.documentId} session={session} />;
  }

  if (route.type === "shared-document" && route.shareId) {
    return <SharedDocumentPage shareId={route.shareId} session={session} />;
  }

  if (route.type === "cli-login") {
    return <CliLoginPage session={session} requestId={route.requestId} />;
  }

  return <Landing session={session} />;
}

export default App;
