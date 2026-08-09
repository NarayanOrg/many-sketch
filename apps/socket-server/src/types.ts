export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  userId: string;
  points: Point[];
  color: string;
  width: number;
}

export interface Participant {
  userId: string;
  username: string;
  stickerId: string;
  socketId: string;
}

export interface LobbyState {
  id: string;
  name: string;
  hostId: string;
  duration: number; // seconds
  maxPlayers: number;
  chatEnabled: boolean;
  status: "waiting" | "active" | "finished";
  createdAt: number; // epoch ms
  startedAt: number | null; // set when the drawing countdown begins (lobby full)
  participants: Map<string, Participant>; // keyed by userId
  strokes: Stroke[]; // in-memory during the session, flushed to DB
  pendingStrokeInserts: Stroke[]; // batched, not yet written to Supabase
}

export interface ChatMessage {
  userId: string;
  username: string;
  body: string;
  stickerId: string;
  createdAt: number;
}