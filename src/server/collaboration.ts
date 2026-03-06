import type { ServerWebSocket } from "bun";
import { eq } from "drizzle-orm";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import { db } from "@/server/db/client";
import { documentCollaborationStates, documents, type Role } from "@/server/db/schema";

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

type CollaborationUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  colorLight: string;
};

export type CollaborationSocketData = {
  documentId: string;
  user: CollaborationUser;
  awarenessClientId: number | null;
};

type CollaborationRoom = {
  documentId: string;
  doc: Y.Doc;
  text: Y.Text;
  awareness: awarenessProtocol.Awareness;
  connections: Set<ServerWebSocket<CollaborationSocketData>>;
  lastUpdatedByUserId: string | null;
  persistTimer: ReturnType<typeof setTimeout> | null;
};

type AwarenessEntry = {
  clientId: number;
  clock: number;
  state: Record<string, unknown> | null;
};

const rooms = new Map<string, CollaborationRoom>();
const roomLoads = new Map<string, Promise<CollaborationRoom>>();
const presencePalette = [
  ["#0f766e", "#99f6e4"],
  ["#1d4ed8", "#bfdbfe"],
  ["#9a3412", "#fed7aa"],
  ["#7c2d12", "#fdba74"],
  ["#6d28d9", "#ddd6fe"],
  ["#be123c", "#fecdd3"],
] as const;

const roleCanWrite = (role: Role) => role === "owner" || role === "editor";

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const colorsForUser = (userId: string) => presencePalette[hashString(userId) % presencePalette.length];

export const createCollaborationUser = (input: { id: string; name: string; email: string; role: Role }): CollaborationUser => {
  const [color, colorLight] = colorsForUser(input.id);
  return {
    ...input,
    color,
    colorLight,
  };
};

const encodeSyncUpdate = (update: Uint8Array) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
};

const encodeAwarenessMessage = (update: Uint8Array) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
};

const decodeState = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
const encodeState = (value: Uint8Array) => Buffer.from(value).toString("base64");

const decodeAwarenessEntries = (update: Uint8Array): AwarenessEntry[] => {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  const entries: AwarenessEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    entries.push({
      clientId: decoding.readVarUint(decoder),
      clock: decoding.readVarUint(decoder),
      state: JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown> | null,
    });
  }

  return entries;
};

const encodeAwarenessEntries = (entries: AwarenessEntry[]) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);

  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, JSON.stringify(entry.state));
  }

  return encoding.toUint8Array(encoder);
};

const persistRoom = async (room: CollaborationRoom) => {
  room.persistTimer = null;

  const now = new Date();
  const yjsState = encodeState(Y.encodeStateAsUpdate(room.doc));

  await db
    .insert(documentCollaborationStates)
    .values({
      documentId: room.documentId,
      yjsState,
      updatedByUserId: room.lastUpdatedByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: documentCollaborationStates.documentId,
      set: {
        yjsState,
        updatedByUserId: room.lastUpdatedByUserId,
        updatedAt: now,
      },
    });

  await db
    .update(documents)
    .set({
      currentMarkdown: room.text.toString(),
      updatedAt: now,
    })
    .where(eq(documents.id, room.documentId));
};

const schedulePersist = (room: CollaborationRoom, updatedByUserId: string | null) => {
  room.lastUpdatedByUserId = updatedByUserId;

  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
  }

  room.persistTimer = setTimeout(() => {
    void persistRoom(room);
  }, 700);
};

const buildRoom = async (documentId: string) => {
  const [row] = await db
    .select({
      currentMarkdown: documents.currentMarkdown,
      documentUpdatedAt: documents.updatedAt,
      savedState: documentCollaborationStates.yjsState,
      collaborationUpdatedAt: documentCollaborationStates.updatedAt,
    })
    .from(documents)
    .leftJoin(documentCollaborationStates, eq(documentCollaborationStates.documentId, documents.id))
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!row) {
    throw new Error("Document not found");
  }

  const doc = new Y.Doc();
  const text = doc.getText("content");

  if (row.savedState && (!row.collaborationUpdatedAt || row.collaborationUpdatedAt >= row.documentUpdatedAt)) {
    Y.applyUpdate(doc, decodeState(row.savedState));
  } else if (row.currentMarkdown) {
    text.insert(0, row.currentMarkdown);
  }

  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);

  const room: CollaborationRoom = {
    documentId,
    doc,
    text,
    awareness,
    connections: new Set(),
    lastUpdatedByUserId: null,
    persistTimer: null,
  };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const payload = encodeSyncUpdate(update);

    for (const connection of room.connections) {
      if (connection === origin) continue;
      connection.sendBinary(payload);
    }

    const updatedByUserId =
      origin && typeof origin === "object" && "data" in (origin as Record<string, unknown>)
        ? ((origin as ServerWebSocket<CollaborationSocketData>).data.user.id ?? null)
        : room.lastUpdatedByUserId;

    schedulePersist(room, updatedByUserId);
  });

  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changedClients = [...added, ...updated, ...removed];
    if (changedClients.length === 0) return;

    const payload = encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients));

    for (const connection of room.connections) {
      if (connection === origin) continue;
      connection.sendBinary(payload);
    }
  });

  rooms.set(documentId, room);
  return room;
};

const getRoom = async (documentId: string) => {
  const existing = rooms.get(documentId);
  if (existing) return existing;

  const pending = roomLoads.get(documentId);
  if (pending) return pending;

  const roomPromise = buildRoom(documentId)
    .catch(error => {
      rooms.delete(documentId);
      throw error;
    })
    .finally(() => {
      roomLoads.delete(documentId);
    });

  roomLoads.set(documentId, roomPromise);
  return roomPromise;
};

const destroyRoomIfIdle = async (documentId: string) => {
  const room = rooms.get(documentId);
  if (!room || room.connections.size > 0) return;

  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
    await persistRoom(room);
  }

  room.awareness.destroy();
  room.doc.destroy();
  rooms.delete(documentId);
};

const sanitizeAwarenessUpdate = (ws: ServerWebSocket<CollaborationSocketData>, update: Uint8Array) => {
  const entries = decodeAwarenessEntries(update);
  if (entries.length === 0) return null;

  const targetClientId = ws.data.awarenessClientId ?? entries.find(entry => entry.state !== null)?.clientId ?? entries[0]?.clientId;

  if (typeof targetClientId !== "number") {
    return null;
  }

  ws.data.awarenessClientId = targetClientId;

  const filteredEntries = entries
    .filter(entry => entry.clientId === targetClientId)
    .map(entry => ({
      ...entry,
      state:
        entry.state === null
          ? null
          : {
              ...entry.state,
              user: {
                name: ws.data.user.name,
                color: ws.data.user.color,
                colorLight: ws.data.user.colorLight,
              },
            },
    }));

  if (filteredEntries.length === 0) {
    return null;
  }

  return encodeAwarenessEntries(filteredEntries);
};

export const attachCollaborationSocket = async (ws: ServerWebSocket<CollaborationSocketData>) => {
  const room = await getRoom(ws.data.documentId);
  room.connections.add(ws);

  const currentPresenceIds = Array.from(room.awareness.getStates().keys()).filter(clientId => clientId !== room.awareness.clientID);
  if (currentPresenceIds.length > 0) {
    ws.sendBinary(encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(room.awareness, currentPresenceIds)));
  }
};

export const handleCollaborationMessage = async (
  ws: ServerWebSocket<CollaborationSocketData>,
  message: string | Buffer | ArrayBuffer | Uint8Array,
) => {
  const room = await getRoom(ws.data.documentId);
  const payload =
    typeof message === "string"
      ? new TextEncoder().encode(message)
      : message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : message instanceof Uint8Array
          ? message
          : new Uint8Array(message);

  const decoder = decoding.createDecoder(payload);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    const syncType = decoding.readVarUint(decoder);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);

    if (syncType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncStep1(decoder, encoder, room.doc);
      syncProtocol.writeSyncStep1(encoder, room.doc);
      ws.sendBinary(encoding.toUint8Array(encoder));
      return;
    }

    if (!roleCanWrite(ws.data.user.role)) {
      return;
    }

    if (syncType === syncProtocol.messageYjsSyncStep2) {
      syncProtocol.readSyncStep2(decoder, room.doc, ws);
      return;
    }

    if (syncType === syncProtocol.messageYjsUpdate) {
      syncProtocol.readUpdate(decoder, room.doc, ws);
    }

    return;
  }

  if (messageType === messageAwareness) {
    const sanitized = sanitizeAwarenessUpdate(ws, decoding.readVarUint8Array(decoder));
    if (sanitized) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, sanitized, ws);
    }
    return;
  }

  if (messageType === messageQueryAwareness) {
    const activeClientIds = Array.from(room.awareness.getStates().keys()).filter(clientId => clientId !== room.awareness.clientID);
    if (activeClientIds.length > 0) {
      ws.sendBinary(encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(room.awareness, activeClientIds)));
    }
  }
};

export const detachCollaborationSocket = async (ws: ServerWebSocket<CollaborationSocketData>) => {
  const room = rooms.get(ws.data.documentId);
  if (!room) return;

  room.connections.delete(ws);

  if (typeof ws.data.awarenessClientId === "number") {
    awarenessProtocol.removeAwarenessStates(room.awareness, [ws.data.awarenessClientId], ws);
    ws.data.awarenessClientId = null;
  }

  await destroyRoomIfIdle(ws.data.documentId);
};

export const replaceCollaborationMarkdownIfRoomActive = async (documentId: string, markdown: string, userId: string | null) => {
  const room = rooms.get(documentId);
  if (!room) return false;

  if (room.text.toString() === markdown) {
    return true;
  }

  room.doc.transact(() => {
    if (room.text.length > 0) {
      room.text.delete(0, room.text.length);
    }
    if (markdown) {
      room.text.insert(0, markdown);
    }
  });

  schedulePersist(room, userId);
  return true;
};

export const listDocumentPresence = async (documentId: string) => {
  const room = rooms.get(documentId);
  if (!room) {
    return [];
  }

  const counts = new Map<string, { userId: string; name: string; email: string; role: Role; connections: number }>();

  for (const connection of room.connections) {
    const existing = counts.get(connection.data.user.id);
    if (existing) {
      existing.connections += 1;
      continue;
    }

    counts.set(connection.data.user.id, {
      userId: connection.data.user.id,
      name: connection.data.user.name,
      email: connection.data.user.email,
      role: connection.data.user.role,
      connections: 1,
    });
  }

  return Array.from(counts.values());
};
