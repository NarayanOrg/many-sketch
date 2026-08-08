import { NextResponse } from "next/server"
import { supabase } from "@/supabase/server"

export async function GET() {
  const { data: lobbies, error } = await supabase
    .from("lobbies")
    .select("id,name,finished_at")
    .eq("status", "finished")
    .order("finished_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Failed to load gallery lobbies", error)
    return NextResponse.json({ error: "Unable to load gallery" }, { status: 500 })
  }

  const socketBase = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ?? ""

  const items = (lobbies ?? []).map((lobby) => ({
    id: lobby.id,
    title: lobby.name,
    thumbnailUrl: socketBase ? `${socketBase.replace(/\/$/, "")}/lobbies/${lobby.id}/thumbnail` : `/lobbies/${lobby.id}/thumbnail`,
    createdAt: lobby.finished_at,
  }))

  return NextResponse.json({ items })
}
