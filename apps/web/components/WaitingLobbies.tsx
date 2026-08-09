"use client"
import React from "react"
import Link from "next/link"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { getSocket } from "@/lib/socket"
import type { Socket } from "socket.io-client"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, MessageCircle, MessageCircleOff, Clock, ArrowRight } from "lucide-react"

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              socketConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {socketConnected ? "Live updates" : "Refreshing automatically"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-border bg-background p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : lobbies.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">No waiting lobbies right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start one and it&apos;ll show up here for others to join.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lobbies.map((lobby) => {
            const fillRatio = lobby.max_players
              ? lobby.participantCount / lobby.max_players
              : 0
            const almostFull = lobby.remainingSlots > 0 && lobby.remainingSlots <= 2

            return (
              <Link
                key={lobby.id}
                href={`/${lobby.id}`}
                className="group relative overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-sm transition hover:border-foreground/20 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">
                      {lobby.name || "Unnamed lobby"}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {lobby.participantCount}/{lobby.max_players} players
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={lobby.chat_enabled ? "secondary" : "outline"}
                    className="shrink-0 gap-1"
                  >
                    {lobby.chat_enabled ? (
                      <MessageCircle className="h-3 w-3" />
                    ) : (
                      <MessageCircleOff className="h-3 w-3" />
                    )}
                    {lobby.chat_enabled ? "Chat" : "No chat"}
                  </Badge>
                </div>

                {/* Fill progress — quick visual read on how close this lobby is to starting */}
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/80 transition-all"
                    style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {Math.ceil(lobby.duration / 60)} min
                    </span>
                    {almostFull && (
                      <span className="font-medium text-amber-600">
                        {lobby.remainingSlots} spot{lobby.remainingSlots === 1 ? "" : "s"} left
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition group-hover:gap-1.5">
                    Join
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}