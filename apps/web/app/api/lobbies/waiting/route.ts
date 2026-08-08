import { NextResponse } from "next/server"
import { supabase } from "@/supabase/server"

export async function GET() {
  const { data: lobbies, error } = await supabase
    .from("lobbies")
    .select("id,name,max_players,duration,chat_enabled,created_at")
    .eq("status", "waiting")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to load waiting lobbies", error)
    return NextResponse.json({ error: "Unable to load lobbies" }, { status: 500 })
  }

  const lobbyIds = (lobbies ?? []).map((lobby) => lobby.id)
  const { data: participants, error: participantsError } = await supabase
    .from("lobby_participants")
    .select("lobby_id")
    .in("lobby_id", lobbyIds)

  if (participantsError) {
    console.error("Failed to load lobby participant counts", participantsError)
    return NextResponse.json({ error: "Unable to load lobbies" }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const row of participants ?? []) {
    counts[row.lobby_id] = (counts[row.lobby_id] ?? 0) + 1
  }

  const result = (lobbies ?? []).map((lobby) => ({
    id: lobby.id,
    name: lobby.name,
    max_players: lobby.max_players,
    duration: lobby.duration,
    chat_enabled: lobby.chat_enabled,
    participantCount: counts[lobby.id] ?? 0,
    remainingSlots: Math.max(0, lobby.max_players - (counts[lobby.id] ?? 0)),
  }))

  return NextResponse.json({ lobbies: result })
}
