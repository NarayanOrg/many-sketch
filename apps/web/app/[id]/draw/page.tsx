"use client"
import React from "react"
import { useParams, useRouter } from "next/navigation"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { getSocket } from "@/lib/socket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Send, ArrowLeft } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { stickerImageUrl } from "@/lib/stickers"
import type { Socket } from "socket.io-client"

interface Stroke {
  userId: string
  points: { x: number; y: number }[]
  color: string
  width: number
}

interface Participant {
  userId: string
  username: string
  stickerId: string
}

interface ChatMessage {
  userId: string
  username: string
  body: string
  createdAt: number
}

interface CursorPayload {
  userId: string
  x: number
  y: number
  color: string
  username: string
  stickerId: string
}

interface JoinResponse {
  status: "waiting" | "active" | "finished"
  participants: Participant[]
  chatEnabled: boolean
  name: string
  startedAt?: number
  duration?: number
  strokes?: Stroke[]
}

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800
const DEFAULT_COLOR = "#111827"
const DEFAULT_WIDTH = 4

export default function DrawPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const lobbyId = params?.id

  const [user, setUser] = React.useState<User | null | undefined>(undefined)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [chatEnabled, setChatEnabled] = React.useState(false)
  const [lobbyName, setLobbyName] = React.useState("")
  const [participants, setParticipants] = React.useState<Participant[]>([])
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [message, setMessage] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)
  const [isReady, setIsReady] = React.useState(false)
  const [color, setColor] = React.useState(DEFAULT_COLOR)
  const [width, setWidth] = React.useState(DEFAULT_WIDTH)
  const [cursors, setCursors] = React.useState<
    Record<
      string,
      {
        x: number
        y: number
        color: string
        username: string
        stickerId: string
        lastSeen: number
      }
    >
  >({})
  const [canvasRect, setCanvasRect] = React.useState<DOMRect | null>(null)
  const [now, setNow] = React.useState<number>(0)
  const [startedAt, setStartedAt] = React.useState<number | null>(null)
  const [durationSec, setDurationSec] = React.useState<number | null>(null)

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const socketRef = React.useRef<Socket | null>(null)
  const currentStrokeRef = React.useRef<Stroke | null>(null)
  const drawingRef = React.useRef(false)
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser)
    return () => unsub()
  }, [])

  const drawCanvasBackground = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }, [])

  const drawStroke = React.useCallback((stroke: Stroke) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = "round"
    ctx.beginPath()

    const [first, ...rest] = stroke.points
    if (!first) return

    ctx.moveTo(first.x, first.y)
    for (const point of rest) {
      ctx.lineTo(point.x, point.y)
    }

    ctx.stroke()
  }, [])

  const handleIncomingStroke = React.useCallback(
    (stroke: Stroke) => {
      drawStroke(stroke)
    },
    [drawStroke]
  )

  const handleIncomingMessage = React.useCallback((incoming: ChatMessage) => {
    setMessages((prev) => [...prev, incoming])
  }, [])

  React.useEffect(() => {
    if (!user || !lobbyId) return

    let cancelled = false
    let clientSocket: Socket | null = null

    async function init() {
      try {
        const socket = await getSocket()
        if (cancelled) return

        clientSocket = socket
        socketRef.current = socket

        socket.on("draw:stroke", handleIncomingStroke)
        socket.on("chat:message", handleIncomingMessage)
        socket.on("draw:cursor", (c: CursorPayload) => {
          console.log("cursor payload received on client:", c)
          setCursors((prev) => {
            const next = { ...prev, [c.userId]: { x: c.x, y: c.y, color: c.color, username: c.username, stickerId: c.stickerId, lastSeen: Date.now() } }
            // console.log("cursors state now:", next)
            return next
          })
        })

        socket.on("lobby:started", (payload: { startedAt?: number }) => {
          if (payload?.startedAt) setStartedAt(payload.startedAt)
        })
        socket.on("lobby:participantJoined", (participant: Participant) => {
          setParticipants((prev) =>
            prev.some((item) => item.userId === participant.userId)
              ? prev
              : [...prev, participant]
          )
        })
        socket.on("lobby:participantLeft", ({ userId }: { userId: string }) => {
          setParticipants((prev) =>
            prev.filter((item) => item.userId !== userId)
          )
        })
        socket.on("lobby:finished", () => {
          router.push(`/gallery?focus=${lobbyId}`)
        })

        const response = await new Promise<JoinResponse>((resolve) => {
          socket.emit("lobby:join", { lobbyId }, resolve)
        })

        if (cancelled) return

        // server may return an error object instead of JoinResponse
        function isErrorResponse(r: unknown): r is { error: string } {
          return (
            typeof r === "object" &&
            r !== null &&
            "error" in (r as Record<string, unknown>)
          )
        }

        if (isErrorResponse(response)) {
          setError(response.error)
          setLoading(false)
          return
        }

        if (response.status === "waiting") {
          router.replace(`/${lobbyId}`)
          return
        }

        if (response.status === "finished") {
          router.push(`/gallery?focus=${lobbyId}`)
          return
        }

        setParticipants(response.participants)
        setChatEnabled(response.chatEnabled)
        setLobbyName(response.name)
        if (response.startedAt) setStartedAt(response.startedAt)
        if (typeof response.duration === "number")
          setDurationSec(response.duration)
        drawCanvasBackground()

        if (Array.isArray(response.strokes)) {
          response.strokes.forEach((stroke: Stroke) => drawStroke(stroke))
        }

        setIsReady(true)
      } catch (err) {
        console.error("Failed to enter draw room", err)
        setError("Unable to join the drawing room.")
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (clientSocket) {
        clientSocket.off("draw:stroke", handleIncomingStroke)
        clientSocket.off("chat:message", handleIncomingMessage)
        clientSocket.off("lobby:participantJoined")
        clientSocket.off("lobby:participantLeft")
        clientSocket.off("lobby:finished")
        clientSocket.off("draw:cursor")
        clientSocket.off("lobby:started")
      }
    }
  }, [
    user,
    lobbyId,
    router,
    drawCanvasBackground,
    drawStroke,
    handleIncomingStroke,
    handleIncomingMessage,
  ])

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    }
  }

  // compute remaining seconds from startedAt + duration using ticking `now`
  const secondsLeft = React.useMemo(() => {
    if (startedAt == null || durationSec == null) return null
    const endAt = startedAt + durationSec * 1000
    return Math.max(0, Math.ceil((endAt - now) / 1000))
  }, [startedAt, durationSec, now])

  // update a ticking clock used for stale cursor checks and renders
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  // keep canvas bounding rect in state (avoid reading ref during render)
  React.useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => setCanvasRect(el.getBoundingClientRect())
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [loading])

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isReady || !user) return
    const point = getCanvasPoint(event)
    if (!point) return
    drawingRef.current = true
    lastPointRef.current = point
    currentStrokeRef.current = {
      userId: user.uid,
      points: [point],
      color,
      width,
    }
  }

  const lastEmitRef = React.useRef(0)

  const continueDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !currentStrokeRef.current) return
    const point = getCanvasPoint(event)
    if (!point) return
    const lastPoint = lastPointRef.current
    const canvas = canvasRef.current
    if (!lastPoint || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(lastPoint.x, lastPoint.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    currentStrokeRef.current.points.push(point)
    lastPointRef.current = point
    // send cursor update (throttled)
    const now = Date.now()
    if (socketRef.current && now - lastEmitRef.current > 50) {
      socketRef.current.emit("draw:cursor", {
        lobbyId,
        x: point.x,
        y: point.y,
        color,
      })
      lastEmitRef.current = now
    }
  }

  const stopDrawing = () => {
    if (!drawingRef.current || !currentStrokeRef.current) {
      drawingRef.current = false
      return
    }

    if (currentStrokeRef.current.points.length > 1 && socketRef.current) {
      socketRef.current.emit("draw:stroke", {
        lobbyId,
        stroke: {
          points: currentStrokeRef.current.points,
          color: currentStrokeRef.current.color,
          width: currentStrokeRef.current.width,
        },
      })
    }

    currentStrokeRef.current = null
    drawingRef.current = false
    lastPointRef.current = null
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event)
    if (!point || !socketRef.current) return
    const now = Date.now()
    const last = lastEmitRef.current
    if (now - last > 75) {
      socketRef.current.emit("draw:cursor", {
        lobbyId,
        x: point.x,
        y: point.y,
        color,
      })
      lastEmitRef.current = now
    }
  }

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = message.trim()
    if (!body || !socketRef.current) return

    setIsSending(true)
    socketRef.current.emit("chat:send", { lobbyId, body })
    setMessage("")
    setIsSending(false)
  }

  if (user === undefined || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-4 h-10 w-64 rounded-lg bg-muted" />
        <div className="grid gap-4 lg:grid-cols-[1.8fr_0.8fr]">
          <div className="rounded-xl bg-muted" style={{ height: 420 }} />
          <div className="space-y-4">
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-52 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="mb-4 text-muted-foreground">{error}</p>
        <Button onClick={() => router.push(`/${lobbyId}`)}>
          Back to lobby
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {lobbyName || "Live draw"}
              </h1>
              <Badge variant="secondary">Live</Badge>
              {secondsLeft !== null && (
                <div
                  className={`ml-3 rounded-md px-2 py-1 text-sm font-medium ${secondsLeft <= 10 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {Math.floor(secondsLeft / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(secondsLeft % 60).toString().padStart(2, "0")}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Draw on the shared canvas with your lobby.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/${lobbyId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to lobby
          </Button>
          <Badge variant="outline">
            {participants.length} player{participants.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.8fr_0.8fr]">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Canvas
              </p>
              <p className="text-xs text-muted-foreground">
                Drag or draw to add strokes to the shared board.
              </p>
            </div>
            <Badge variant="outline">{participants.length} players</Badge>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-border bg-white">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full touch-none bg-white"
              onPointerDown={startDrawing}
              onPointerMove={(e) => {
                continueDrawing(e)
                handlePointerMove(e)
              }}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              onPointerCancel={stopDrawing}
            />
            {/* Cursors overlay */}
            {Object.entries(cursors).map(([id, c]) => {
              // hide stale cursors using stable `now` state
              if (now - c.lastSeen > 5000) return null
              const rect = canvasRect
             console.log("canvasRect:", canvasRect, "cursors:", cursors)
              const left = rect ? (c.x / CANVAS_WIDTH) * rect.width : 0
              const top = rect ? (c.y / CANVAS_HEIGHT) * rect.height : 0
              return (
                <div
                  key={id}
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    transform: "translate(-50%, -120%)",
                  }}
                  className="pointer-events-none absolute z-50"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={stickerImageUrl(c.stickerId)}
                      alt="sticker"
                      className="h-6 w-6 rounded-full"
                    />
                    <div
                      className={`rounded-full px-2 py-1 text-xs font-medium`}
                      style={{ background: c.color, color: "#fff" }}
                    >
                      {c.username}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Players</p>
              <Badge variant="outline">{participants.length}</Badge>
            </div>
            <div className="space-y-3">
              {participants.map((participant) => (
                <div
                  key={participant.userId}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={stickerImageUrl(participant.stickerId)} />
                    <AvatarFallback>
                      {participant.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {participant.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {chatEnabled ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Lobby chat</p>
                <Badge variant="outline">{messages.length}</Badge>
              </div>
              <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-white p-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((messageItem, index) => (
                    <div
                      key={`${messageItem.userId}-${messageItem.createdAt}-${index}`}
                      className="flex items-start gap-3 rounded-lg bg-muted/50 p-2"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={stickerImageUrl(messageItem.userId)}
                        />
                        <AvatarFallback>
                          {messageItem.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">
                          {messageItem.username}
                        </p>
                        <p className="text-sm leading-snug text-muted-foreground">
                          {messageItem.body}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="chat-input">Send a message</Label>
                  <Input
                    id="chat-input"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Type a quick message"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!message.trim() || isSending}
                >
                  {isSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send
                </Button>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
              Chat is disabled for this lobby.
            </div>
          )}

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Brush settings</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-white p-0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Stroke width</Label>
                <input
                  id="width"
                  type="range"
                  min={1}
                  max={24}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">{width}px</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
