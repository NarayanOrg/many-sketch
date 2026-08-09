import "dotenv/config";
import http from "node:http";
import { customAlphabet } from "nanoid";
import { Server, type Socket } from "socket.io";
import cors from "cors";
import express from "express";

import { verifyFirebaseToken } from "./lib/verifyFirebaseToken.js";
import { supabase } from "./lib/supabase.js";
import { roomManager } from "./roomManager.js";
import { renderStrokesToPng } from "./renderCanvas.js";
import { getCachedThumbnail, setCachedThumbnail } from "./thumbnailCache.js";
import type { ChatMessage, Stroke } from "./types.js";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:3000").split(",");

// ------------------------------------------------------------------
// HTTP app — on-demand thumbnail endpoint + healthcheck.
// Socket.io attaches to the same underlying HTTP server.
// ------------------------------------------------------------------
const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));

app.get("/health", (_req, res) => res.send("ok"));

app.get("/lobbies/:id/thumbnail", async (req, res) => {
  const { id } = req.params;

  const cached = getCachedThumbnail(id);
  if (cached) {
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(cached);
  }

  const { data: strokeRows, error } = await supabase
    .from("strokes")
    .select("user_id, points, color, width")
    .eq("lobby_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch strokes for thumbnail:", error);
    return res.status(500).send("Failed to render thumbnail");
  }

  if (!strokeRows || strokeRows.length === 0) {
    return res.status(404).send("No drawing data for this lobby");
  }

  const strokes: Stroke[] = strokeRows.map((r) => ({
    userId: r.user_id,
    points: r.points as { x: number; y: number }[],
    color: r.color,
    width: r.width,
  }));

  const png = renderStrokesToPng(strokes);
  setCachedThumbnail(id, png);

  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(png);
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGINS, methods: ["GET", "POST"], credentials: true },
});

function getWaitingLobbySnapshot() {
  return roomManager.listWaiting().map((room) => ({
    id: room.id,
    name: room.name,
    max_players: room.maxPlayers,
    duration: room.duration,
    chat_enabled: room.chatEnabled,
    participantCount: room.participants.size,
    remainingSlots: Math.max(0, room.maxPlayers - room.participants.size),
  }))
}

function broadcastWaitingLobbies() {
  io.emit("lobbies:waitingUpdated", getWaitingLobbySnapshot())
}

// ------------------------------------------------------------------
// Socket auth middleware — every connection must present a valid
// Firebase ID token. Verified once at connect time; uid is trusted
// for the lifetime of the socket.
// ------------------------------------------------------------------
interface AuthedSocket extends Socket {
  data: {
    uid: string;
    username: string;
    stickerId: string;
  };
}

io.use(async (socket, next) => {
  try {
    const idToken = socket.handshake.auth?.idToken;
    if (!idToken) throw new Error("Missing idToken");

    const { uid } = await verifyFirebaseToken(idToken);

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, sticker_id")
      .eq("id", uid)
      .single();

    if (error || !user) throw new Error("User profile not found — complete setup first");

    socket.data.uid = user.id;
    socket.data.username = user.username;
    socket.data.stickerId = user.sticker_id;
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error("Auth failed"));
  }
});

io.on("connection", (socket: AuthedSocket) => {
  const { uid, username, stickerId } = socket.data;

  // ----------------------------------------------------------------
  // Create lobby
  // ----------------------------------------------------------------
  socket.on(
    "lobby:create",
    async (
      payload: {
        name: string;
        duration: number;
        maxPlayers: number;
        chatEnabled: boolean;
      },
      ack: (res: { lobbyId: string } | { error: string }) => void
    ) => {
      try {
        const duration = Math.min(Math.max(payload.duration, 10), 300);
        const maxPlayers = Math.min(Math.max(payload.maxPlayers, 2), 50);
        const chatEnabled = payload.chatEnabled !== false; // default true
        const lobbyId = nanoid();

        const { error } = await supabase.from("lobbies").insert({
          id: lobbyId,
          name: payload.name.slice(0, 80),
          host_id: uid,
          duration,
          max_players: maxPlayers,
          chat_enabled: chatEnabled,
          status: "waiting",
        });
        if (error) throw error;

        // roomManager.create's input type is
        // Omit<LobbyState, "participants" | "pendingStrokeInserts" | "startedAt" | "strokes">
        // — it deliberately excludes those four fields and initializes
        // them internally, so they must NOT be passed here.
        roomManager.create({
          id: lobbyId,
          name: payload.name,
          hostId: uid,
          duration,
          maxPlayers,
          chatEnabled,
          status: "waiting",
          createdAt: Date.now(),
        });

        ack({ lobbyId });
        broadcastWaitingLobbies();
      } catch (err) {
        console.error("lobby:create failed", err);
        ack({ error: "Failed to create lobby" });
      }
    }
  );

  socket.on("lobbies:subscribe", (ack) => {
    ack({ lobbies: getWaitingLobbySnapshot() })
  })

  // ----------------------------------------------------------------
  // Join lobby
  // ----------------------------------------------------------------
  socket.on(
    "lobby:join",
    async (
      payload: { lobbyId: string },
      ack: (
        res:
          | {
              ok: true;
              name: string;
              maxPlayers: number;
              duration: number;
              startedAt: number | null;
              strokes: Stroke[];
              chatEnabled: boolean;
              status: "waiting" | "active" | "finished";
              hostId: string;
              participants: { userId: string; username: string; stickerId: string }[];
            }
          | { error: string }
      ) => void
    ) => {
      const room = roomManager.get(payload.lobbyId);
      if (!room) return ack({ error: "Lobby not found or already ended" });
      if (room.status === "finished") return ack({ error: "Lobby has already finished" });
      if (room.participants.has(uid)) {
        socket.join(payload.lobbyId);
        return ack({
          ok: true,
          name: room.name,
          maxPlayers: room.maxPlayers,
          duration: room.duration,
          startedAt: room.startedAt,
          strokes: room.strokes,
          chatEnabled: room.chatEnabled,
          status: room.status,
          hostId: room.hostId,
          participants: [...room.participants.values()].map((p) => ({
            userId: p.userId,
            username: p.username,
            stickerId: p.stickerId,
          })),
        });
      }
      if (room.status === "active") return ack({ error: "Drawing has already started" });
      if (room.participants.size >= room.maxPlayers) return ack({ error: "Lobby is full" });

      socket.join(payload.lobbyId);
      roomManager.addParticipant(payload.lobbyId, {
        userId: uid,
        username,
        stickerId,
        socketId: socket.id,
      });

      await supabase.from("lobby_participants").upsert(
        { lobby_id: payload.lobbyId, user_id: uid },
        { onConflict: "lobby_id,user_id" }
      );

      socket.to(payload.lobbyId).emit("lobby:participantJoined", {
        userId: uid,
        username,
        stickerId,
      });

      // Start the game the moment the lobby fills up.
      if (room.participants.size >= room.maxPlayers && room.status === "waiting") {
        roomManager.markActive(payload.lobbyId);
        room.startedAt = Date.now();
        await supabase.from("lobbies").update({ status: "active" }).eq("id", payload.lobbyId);
        io.to(payload.lobbyId).emit("lobby:started", { lobbyId: payload.lobbyId, startedAt: room.startedAt });
        broadcastWaitingLobbies();
        scheduleLobbyEnd(payload.lobbyId, room.duration);
      }

      ack({
        ok: true,
        name: room.name,
        maxPlayers: room.maxPlayers,
        duration: room.duration,
        startedAt: room.startedAt,
        strokes: room.strokes,
        chatEnabled: room.chatEnabled,
        status: room.status,
        hostId: room.hostId,
        participants: [...room.participants.values()].map((p) => ({
          userId: p.userId,
          username: p.username,
          stickerId: p.stickerId,
        })),
      });
    }
  );

  // ----------------------------------------------------------------
  // Cancel lobby — host only, only while still waiting for players
  // ----------------------------------------------------------------
  socket.on(
    "lobby:cancel",
    async (payload: { lobbyId: string }, ack: (res: { ok: true } | { error: string }) => void) => {
      const room = roomManager.get(payload.lobbyId);
      if (!room) return ack({ error: "Lobby not found" });
      if (room.hostId !== uid) return ack({ error: "Only the host can cancel this lobby" });
      if (room.status !== "waiting") {
        return ack({ error: "Lobby has already started or finished" });
      }

      roomManager.markFinished(payload.lobbyId);
      await supabase
        .from("lobbies")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", payload.lobbyId);

      broadcastWaitingLobbies();

      io.to(payload.lobbyId).emit("lobby:cancelled", { lobbyId: payload.lobbyId });
      roomManager.destroy(payload.lobbyId);

      ack({ ok: true });
    }
  );

  // ----------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------
  socket.on("draw:stroke", (payload: { lobbyId: string; stroke: Omit<Stroke, "userId"> }) => {
    const room = roomManager.get(payload.lobbyId);
    if (!room || room.status !== "active") return;
    if (!room.participants.has(uid)) return;

    const stroke: Stroke = { ...payload.stroke, userId: uid };
    roomManager.addStroke(payload.lobbyId, stroke);

    socket.to(payload.lobbyId).emit("draw:stroke", stroke);
  });

  socket.on(
    "draw:cursor",
    (payload: { lobbyId: string; x: number; y: number; color: string }) => {
      const room = roomManager.get(payload.lobbyId);
      if (!room || room.status !== "active") return;
      if (!room.participants.has(uid)) return;

      socket.to(payload.lobbyId).emit("draw:cursor", {
        userId: uid,
        username,
        stickerId,
        x: payload.x,
        y: payload.y,
        color: payload.color,
      });
    }
  );

  // ----------------------------------------------------------------
  // Chat — only allowed if the lobby was created with chat enabled
  // ----------------------------------------------------------------
  socket.on("chat:send", async (payload: { lobbyId: string; body: string }) => {
    const room = roomManager.get(payload.lobbyId);
    if (!room || room.status !== "active") return;
    if (!room.chatEnabled) return; // chat disabled for this lobby
    if (!room.participants.has(uid)) return;

    const body = payload.body.slice(0, 500).trim();
    if (!body) return;

    const message: ChatMessage = { userId: uid, username, body, stickerId, createdAt: Date.now() };

    io.to(payload.lobbyId).emit("chat:message", message);

    supabase
      .from("chat_messages")
      .insert({ lobby_id: payload.lobbyId, user_id: uid, body, sticker_id: stickerId })
      .then(({ error }) => {
        if (error) console.error("Failed to persist chat message", error);
      });
  });

  // ----------------------------------------------------------------
  // Disconnect
  // ----------------------------------------------------------------
  // FIX: this previously iterated roomManager.listActive(), which (given
  // its name, mirrored by listWaiting()) almost certainly returns only
  // rooms with status === "active". That made `wasWaiting` permanently
  // false inside the loop, so a participant who left during the waiting
  // phase was NEVER removed from the room, never deleted from
  // `lobby_participants`, and the waiting-lobby list shown to other users
  // (broadcastWaitingLobbies) never reflected their departure — a ghost
  // seat that's never freed. We now iterate both waiting and active rooms.
  socket.on("disconnect", () => {
    const roomsToCheck = [...roomManager.listWaiting(), ...roomManager.listActive()];
    for (const room of roomsToCheck) {
      const wasWaiting = room.status === "waiting"
      if (room.participants.has(uid)) {
        roomManager.removeParticipantBySocket(room.id, socket.id)
        socket.to(room.id).emit("lobby:participantLeft", { userId: uid })
      }
        if (wasWaiting) {
          supabase
            .from("lobby_participants")
            .delete()
            .match({ lobby_id: room.id, user_id: uid })
            .then(({ error }) => {
              if (error) {
                console.error("Failed to remove waiting participant", error)
              }
            })
          broadcastWaitingLobbies()
        }
    }
  });
});

// ----------------------------------------------------------------
// Lobby end — server-owned timer.
// ----------------------------------------------------------------
async function scheduleLobbyEnd(lobbyId: string, durationSeconds: number) {
  setTimeout(() => endLobby(lobbyId), durationSeconds * 1000);
}

async function endLobby(lobbyId: string) {
  const room = roomManager.get(lobbyId);
  if (!room || room.status !== "active") return;

  roomManager.markFinished(lobbyId);

  await flushPendingStrokes(lobbyId);

  await supabase
    .from("lobbies")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", lobbyId);

  const png = renderStrokesToPng(room.strokes);
  setCachedThumbnail(lobbyId, png);

  io.to(lobbyId).emit("lobby:finished", { lobbyId });

  setTimeout(() => roomManager.destroy(lobbyId), 30_000);
}

async function flushPendingStrokes(lobbyId: string) {
  const pending = roomManager.drainPendingStrokes(lobbyId);
  if (pending.length === 0) return;

  const rows = pending.map((s) => ({
    lobby_id: lobbyId,
    user_id: s.userId,
    points: s.points,
    color: s.color,
    width: s.width,
  }));

  const { error } = await supabase.from("strokes").insert(rows);
  if (error) console.error("Failed to flush strokes", error);
}

setInterval(() => {
  for (const room of roomManager.listActive()) {
    flushPendingStrokes(room.id);
  }
}, 5000);

httpServer.listen(PORT, () => {
  console.log(`Socket server listening on :${PORT}`);
});