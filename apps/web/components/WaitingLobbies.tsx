"use client"
import React from "react"
import Link from "next/link"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { getSocket } from "@/lib/socket"
import type { Socket } from "socket.io-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface WaitingLobby {
  id: string
  name: string
  max_players: number
  duration: number
  chat_enabled: boolean
  participantCount: number
  remainingSlots: number
}

export default function WaitingLobbies() {
  const [lobbies, setLobbies] = React.useState<WaitingLobby[]>([])
  const [loading, setLoading] = React.useState(true)
  const [user, setUser] = React.useState<User | null | undefined>(undefined)
  const [socketConnected, setSocketConnected] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  React.useEffect(() => {
    let active = true

    async function loadLobbies() {
      try {
        const response = await fetch("/api/lobbies/waiting")
        if (!response.ok) {
          throw new Error("Failed to load waiting lobbies")
        }

        const data = await response.json()
        if (!active) return
        setLobbies(data.lobbies ?? [])
      } catch (err) {
        console.error(err)
        if (!active) return
        setError("Unable to load lobbies right now.")
      } finally {
        if (active) setLoading(false)
      }
    }

    loadLobbies()
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (!user) return

    let mounted = true
    let socket: Socket | null = null

    async function subscribe() {
      try {
        const sock = await getSocket()
        socket = sock
        if (!mounted) return

        sock.on("lobbies:waitingUpdated", (updated: WaitingLobby[]) => {
          setLobbies(updated)
        })

        const response = await new Promise<any>((resolve) => {
          sock.emit("lobbies:subscribe", resolve)
        })

        if (response?.lobbies) {
          setLobbies(response.lobbies)
        }

        setSocketConnected(true)
      } catch (err) {
        console.error("Unable to subscribe to lobby updates", err)
      }
    }

    subscribe()

    return () => {
      mounted = false
      if (socket) {
        socket.off("lobbies:waitingUpdated")
      }
    }
  }, [user])

  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Waiting lobbies</h2>
          <p className="text-sm text-muted-foreground">
            Join a lobby before it fills up. These are the rooms still waiting
            for players.
          </p>
        </div>
        {socketConnected ? (
          <Badge variant="secondary">Live updates enabled</Badge>
        ) : (
          <Badge variant="outline">Refreshing automatically</Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-destructive">
          {error}
        </div>
      ) : lobbies.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">
          No waiting lobbies are available right now.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lobbies.map((lobby) => (
            <div
              key={lobby.id}
              className="rounded-3xl border border-border bg-background p-6 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {lobby.name || "Unnamed lobby"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {lobby.participantCount}/{lobby.max_players} players ·{" "}
                    {lobby.remainingSlots} remaining
                  </p>
                </div>
                <Badge variant="secondary">
                  {lobby.chat_enabled ? "Chat" : "No chat"}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="text-sm text-muted-foreground">
                  {Math.ceil(lobby.duration / 60)} min round · waiting for
                  players
                </div>
                <Link
                  href={`/${lobby.id}`}
                  className="inline-flex justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                >
                  Join lobby
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
