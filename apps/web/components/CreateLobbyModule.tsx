"use client"
import React from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { getSocket } from "@/lib/socket"

const MIN_DURATION = 30 // seconds
const MAX_DURATION = 300 // seconds, matches server-side cap
const MIN_PLAYERS = 2
const MAX_PLAYERS = 20

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m} min`
  return `${m}m ${s}s`
}

export default function CreateLobbyModule() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [duration, setDuration] = React.useState(120)
  const [maxPlayers, setMaxPlayers] = React.useState(8)
  const [chatEnabled, setChatEnabled] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && !submitting

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    try {
      const socket = await getSocket()

      const res = await new Promise<{ lobbyId: string } | { error: string }>(
        (resolve) => {
          socket.emit(
            "lobby:create",
            { name: name.trim(), duration, maxPlayers, chatEnabled },
            resolve
          )
        }
      )

      if ("error" in res) {
        setError(res.error)
        return
      }

      setOpen(false)
      router.push(`/${res.lobbyId}`)
    } catch (err) {
      console.error("Failed to create lobby", err)
      setError("Couldn't create the lobby. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Create lobby</DialogTrigger>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>Create a lobby</DialogTitle>
          <DialogDescription>
            Set it up, then share the link or let people find it in the public
            lobby list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="lobby-name">Lobby name</Label>
            <Input
              id="lobby-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday doodle jam"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Round length</Label>
              <span className="text-sm text-muted-foreground">
                {formatDuration(duration)}
              </span>
            </div>
            <Slider
              min={MIN_DURATION}
              max={MAX_DURATION}
              step={15}
              value={[duration]}
              onValueChange={(value) =>
                setDuration(
                  Array.isArray(value) ? (value[0] ?? MIN_DURATION) : value
                )
              }
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max players</Label>
              <span className="text-sm text-muted-foreground">
                {maxPlayers}
              </span>
            </div>
            <Slider
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              step={1}
              value={[maxPlayers]}
              onValueChange={(value) =>
                setMaxPlayers(
                  Array.isArray(value) ? (value[0] ?? MIN_PLAYERS) : value
                )
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="chat-toggle" className="cursor-pointer">
                Enable chat
              </Label>
              <p className="text-xs text-muted-foreground">
                Let players talk while drawing
              </p>
            </div>
            <Switch
              id="chat-toggle"
              checked={chatEnabled}
              onCheckedChange={setChatEnabled}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitting ? "Creating..." : "Create lobby"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
