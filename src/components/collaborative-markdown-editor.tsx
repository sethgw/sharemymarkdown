import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { useEffect, useEffectEvent, useRef } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

type CollaborativeMarkdownEditorProps = {
  documentId: string;
  initialMarkdown: string;
  user: {
    id: string;
    name: string;
  };
  readOnly?: boolean;
  onMarkdownChange?: (markdown: string) => void;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
};

const palette = [
  ["#0f766e", "#99f6e4"],
  ["#1d4ed8", "#bfdbfe"],
  ["#9a3412", "#fed7aa"],
  ["#7c2d12", "#fdba74"],
  ["#6d28d9", "#ddd6fe"],
  ["#be123c", "#fecdd3"],
] as const;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const presenceColors = (userId: string) => palette[hashString(userId) % palette.length];

export function CollaborativeMarkdownEditor({
  documentId,
  initialMarkdown,
  user,
  readOnly = false,
  onMarkdownChange,
  onStatusChange,
}: CollaborativeMarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const emitMarkdownChange = useEffectEvent((markdown: string) => onMarkdownChange?.(markdown));
  const emitStatusChange = useEffectEvent((status: "connecting" | "connected" | "disconnected") => onStatusChange?.(status));

  useEffect(() => {
    const host = window.location.host;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const [color, colorLight] = presenceColors(user.id);
    const doc = new Y.Doc();
    const yText = doc.getText("content");
    const provider = new WebsocketProvider(`${protocol}//${host}/api/collab`, documentId, doc, {
      resyncInterval: 15000,
      maxBackoffTime: 4000,
    });

    provider.awareness.setLocalStateField("user", {
      name: user.name,
      color,
      colorLight,
    });

    const state = EditorState.create({
      doc: initialMarkdown,
      extensions: [
        basicSetup,
        history(),
        markdown(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...yUndoManagerKeymap]),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": {
            minHeight: "28rem",
            backgroundColor: "transparent",
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            lineHeight: "1.75",
          },
          ".cm-scroller": {
            minHeight: "28rem",
            padding: "1rem 1.1rem 1.35rem",
          },
          ".cm-content": {
            caretColor: "#1c1917",
          },
          ".cm-line": {
            paddingInline: "0.25rem",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-selectionBackground": {
            backgroundColor: "rgba(28, 25, 23, 0.15)",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            color: "#a8a29e",
          },
        }),
        yCollab(yText, provider.awareness),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current ?? undefined,
    });

    const syncObserver = () => emitMarkdownChange(yText.toString());
    const statusObserver = (event: { status: "connecting" | "connected" | "disconnected" }) => emitStatusChange(event.status);

    yText.observe(syncObserver);
    provider.on("status", statusObserver);
    emitStatusChange("connecting");
    emitMarkdownChange(initialMarkdown);

    return () => {
      provider.off("status", statusObserver);
      yText.unobserve(syncObserver);
      provider.destroy();
      view.destroy();
      doc.destroy();
    };
  }, [documentId, emitMarkdownChange, emitStatusChange, initialMarkdown, readOnly, user.id, user.name]);

  return <div ref={containerRef} className="min-h-[28rem] rounded-2xl border border-stone-200 bg-white/70" />;
}

export default CollaborativeMarkdownEditor;
