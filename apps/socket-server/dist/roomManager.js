/**
 * Holds all currently-active lobbies in memory. This is the source of
 * truth for "live" state (who's connected, in-progress strokes) — the
 * DB is the source of truth for anything that must survive a restart
 * or be queried after the lobby finishes.
 */
class RoomManager {
    rooms = new Map();
    create(lobby) {
        const state = {
            ...lobby,
            startedAt: null,
            participants: new Map(),
            strokes: [],
            pendingStrokeInserts: [],
        };
        this.rooms.set(lobby.id, state);
        return state;
    }
    get(lobbyId) {
        return this.rooms.get(lobbyId);
    }
    addParticipant(lobbyId, participant) {
        const room = this.rooms.get(lobbyId);
        if (!room)
            return null;
        room.participants.set(participant.userId, participant);
        return room;
    }
    removeParticipantBySocket(lobbyId, socketId) {
        const room = this.rooms.get(lobbyId);
        if (!room)
            return null;
        for (const [userId, p] of room.participants) {
            if (p.socketId === socketId) {
                room.participants.delete(userId);
                break;
            }
        }
        return room;
    }
    addStroke(lobbyId, stroke) {
        const room = this.rooms.get(lobbyId);
        if (!room)
            return null;
        room.strokes.push(stroke);
        room.pendingStrokeInserts.push(stroke);
        return room;
    }
    /** Pulls and clears strokes waiting to be flushed to Supabase. */
    drainPendingStrokes(lobbyId) {
        const room = this.rooms.get(lobbyId);
        if (!room || room.pendingStrokeInserts.length === 0)
            return [];
        const drained = room.pendingStrokeInserts;
        room.pendingStrokeInserts = [];
        return drained;
    }
    listActive() {
        // "in flight" = anything not finished yet (waiting for players OR drawing)
        return [...this.rooms.values()].filter((r) => r.status !== "finished");
    }
    listWaiting() {
        return [...this.rooms.values()].filter((r) => r.status === "waiting");
    }
    markActive(lobbyId) {
        const room = this.rooms.get(lobbyId);
        if (!room)
            return null;
        room.status = "active";
        return room;
    }
    markFinished(lobbyId) {
        const room = this.rooms.get(lobbyId);
        if (!room)
            return null;
        room.status = "finished";
        return room;
    }
    /** Free memory once a lobby is finished and fully persisted/rendered. */
    destroy(lobbyId) {
        this.rooms.delete(lobbyId);
    }
}
export const roomManager = new RoomManager();
