"use client"
import React from "react"
import { useParams, useRouter } from "next/navigation"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { getSocket } from "@/lib/socket"
import type { Socket } from "socket.io-client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Share2, Users, X, Check } from "lucide-react"
import { stickerImageUrl } from "@/lib/stickers"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface LobbyParticipant {
  userId: string
  username: string
  stickerId: string
}

interface LobbyDetails {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  duration: number
  chatEnabled: boolean
  status: "waiting" | "active" | "finished"
  participants: LobbyParticipant[]
}

export default function LobbyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const lobbyId = params?.id

  const [user, setUser] = React.useState<User | null | undefined>(undefined)
  const [lobby, setLobby] = React.useState<LobbyDetails | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cancelling, setCancelling] = React.useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser)
    return () => unsub()
  }, [])

  React.useEffect(() => {
    if (!user || !lobbyId) return

    let cancelled = false
    let socket: Socket | null = null

    async function join() {
      try {
        socket = await getSocket()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.emit("lobby:join", { lobbyId }, (res: any) => {
          if (cancelled) return
          if ("error" in res) {
            setError(res.error)
            return
          }

          setLobby({
            id: lobbyId,
            name: res.name,
            hostId: res.hostId,
            maxPlayers: res.maxPlayers,
            duration: res.duration,
            chatEnabled: res.chatEnabled,
            status: res.status,
            participants: res.participants,
          })

          if (res.status === "active") {
            router.replace(`/${lobbyId}/draw`)
          }
        })

        socket.on("lobby:participantJoined", (p: LobbyParticipant) => {
          setLobby((prev) =>
            prev
              ? {
                  ...prev,
                  participants: prev.participants.some(
                    (x) => x.userId === p.userId
                  )
                    ? prev.participants
                    : [...prev.participants, p],
                }
              : prev
          )
        })

        socket.on("lobby:participantLeft", ({ userId }: { userId: string }) => {
          setLobby((prev) =>
            prev
              ? {
                  ...prev,
                  participants: prev.participants.filter(
                    (p) => p.userId !== userId
                  ),
                }
              : prev
          )
        })

        socket.on("lobby:started", () => {
          router.replace(`/${lobbyId}/draw`)
        })

        socket.on("lobby:cancelled", () => {
          setError("This lobby was cancelled by the host.")
        })
      } catch (err) {
        console.error("Failed to join lobby", err)
        setError("Couldn't connect to the lobby. Please try again.")
      }
    }

    join()

    return () => {
      cancelled = true
      if (socket) {
        socket.off("lobby:participantJoined")
        socket.off("lobby:participantLeft")
        socket.off("lobby:started")
        socket.off("lobby:cancelled")
      }
    }
  }, [user, lobbyId, router])

  async function handleCancel() {
    setCancelling(true)
    try {
      const socket = await getSocket()
      const res = await new Promise<{ ok: true } | { error: string }>(
        (resolve) => {
          socket.emit("lobby:cancel", { lobbyId }, resolve)
        }
      )
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.push("/")
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/${lobbyId}`
    try {
      if (navigator.share) {
        await navigator.share({ title: lobby?.name || "Join my lobby", url })
        return
      }
    } catch {
      // user cancelled the native share sheet
    }

    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if ((!error && !lobby)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if(user === undefined){
    router.replace('/')
    return null
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="mb-4 text-muted-foreground">{error}</p>
        <Button onClick={() => router.push("/")}>Back to lobbies</Button>
      </div>
    )
  }

  if (!lobby) return null

  const isHost = user?.uid === lobby.hostId
  const isFull = lobby.participants.length >= lobby.maxPlayers
  const slotsLeft = lobby.maxPlayers - lobby.participants.length

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{lobby.name || "Lobby"}</h1>
            <Badge variant="secondary">
              {lobby.status === "waiting"
                ? "Waiting for players"
                : "Starting..."}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {lobby.chatEnabled ? "Chat enabled" : "Chat disabled"}
            {!isFull &&
              ` · ${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleShare}
            aria-label="Share lobby"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
          </Button>
          {isHost && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCancelDialogOpen(true)}
              aria-label="Cancel lobby"
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="h-4 w-4" />
          Participants ({lobby.participants.length}/{lobby.maxPlayers})
        </div>

        <ul className="space-y-3">
          {lobby.participants.map((p) => (
            <li key={p.userId} className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={stickerImageUrl(p.stickerId)} />
                <AvatarFallback>
                  {p.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{p.username}</span>
              {p.userId === lobby.hostId && (
                <Badge variant="outline" className="ml-auto text-xs">
                  Host
                </Badge>
              )}
            </li>
          ))}
        </ul>

        {!isFull && (
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for more players — drawing starts automatically once the
            lobby is full.
          </div>
        )}
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel lobby</DialogTitle>
            <DialogDescription>
              Cancelling will end this lobby for everyone currently waiting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel this lobby?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
            >
              Keep lobby
            </Button>
            <Button
              onClick={handleCancel}
              className="ml-2"
              disabled={cancelling}
            >
              {cancelling ? "Cancelling..." : "Cancel lobby"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
