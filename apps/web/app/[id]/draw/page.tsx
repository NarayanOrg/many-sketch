"use client"
import React from "react"
import { useParams, useRouter } from "next/navigation"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { getSocket } from "@/lib/socket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface StrokeStartPayload {
  strokeId: string
  userId: string
  color: string
  width: number
  point: { x: number; y: number }
}

interface StrokePointPayload {
  strokeId: string
  userId: string
  point: { x: number; y: number }
}

interface StrokeEndPayload {
  strokeId: string
  userId: string
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
  stickerId: string
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
  const currentStrokeIdRef = React.useRef<string | null>(null)
  const drawingRef = React.useRef(false)
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null)
  // Tracks the last point drawn for each in-progress *remote* stroke, keyed
  // by strokeId, so incoming points can be connected with a line segment
  // instead of waiting for the whole stroke to arrive at the end.
  const remoteStrokesRef = React.useRef<
    Record<string, { color: string; width: number; lastPoint: { x: number; y: number } }>
  >({})

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser)
    return () => unsub()
  }, [])

  // FIX: redirect on both "not yet resolved" (undefined, only transiently)
  // AND "resolved to logged out" (null). Previously only `undefined` was
  // checked, and even then the redirect had no `return`, so the rest of
  // the component kept rendering with a nullish `user` and could crash
  // (e.g. `user.uid` in startDrawing) or navigate mid-render.
  React.useEffect(() => {
    if (user === null) {
      router.replace("/")
    }
  }, [user, router])

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

  // Draws a single segment between two points — used to render remote
  // strokes incrementally as points stream in, instead of waiting for
  // the full stroke on strokeEnd.
  const drawSegment = React.useCallback(
    (
      from: { x: number; y: number },
      to: { x: number; y: number },
      color: string,
      width: number
    ) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    },
    []
  )

  // Kept for replaying persisted strokes on join (response.strokes) and
  // as a fallback if a strokeEnd arrives without a matching strokeStart
  // (e.g. missed due to a reconnect mid-stroke).
  const handleIncomingStroke = React.useCallback(
    (stroke: Stroke) => {
      drawStroke(stroke)
    },
    [drawStroke]
  )

  const handleStrokeStart = React.useCallback((payload: StrokeStartPayload) => {
    remoteStrokesRef.current[payload.strokeId] = {
      color: payload.color,
      width: payload.width,
      lastPoint: payload.point,
    }
  }, [])

  const handleStrokePoint = React.useCallback(
    (payload: StrokePointPayload) => {
      const existing = remoteStrokesRef.current[payload.strokeId]
      if (!existing) {
        // strokeStart was missed (e.g. joined mid-stroke) — start fresh
        // from this point so at least subsequent segments render.
        remoteStrokesRef.current[payload.strokeId] = {
          color: DEFAULT_COLOR,
          width: DEFAULT_WIDTH,
          lastPoint: payload.point,
        }
        return
      }
      drawSegment(existing.lastPoint, payload.point, existing.color, existing.width)
      existing.lastPoint = payload.point
    },
    [drawSegment]
  )

  const handleStrokeEnd = React.useCallback((payload: StrokeEndPayload) => {
    delete remoteStrokesRef.current[payload.strokeId]
  }, [])

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
        socket.on("draw:strokeStart", handleStrokeStart)
        socket.on("draw:point", handleStrokePoint)
        socket.on("draw:strokeEnd", handleStrokeEnd)
        socket.on("chat:message", handleIncomingMessage)
        socket.on("draw:cursor", (c: CursorPayload) => {
          setCursors((prev) => ({
            ...prev,
            [c.userId]: {
              x: c.x,
              y: c.y,
              color: c.color,
              username: c.username,
              stickerId: c.stickerId,
              lastSeen: Date.now(),
            },
          }))
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
          // FIX: a departed participant's cursor was left behind forever
          // (only pruned by the 5s staleness check, which is fine, but
          // removing it immediately avoids a ghost cursor lingering for
          // up to 5s after someone leaves).
          setCursors((prev) => {
            if (!(userId in prev)) return prev
            const next = { ...prev }
            delete next[userId]
            return next
          })
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
        clientSocket.off("draw:strokeStart", handleStrokeStart)
        clientSocket.off("draw:point", handleStrokePoint)
        clientSocket.off("draw:strokeEnd", handleStrokeEnd)
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
    handleStrokeStart,
    handleStrokePoint,
    handleStrokeEnd,
    handleIncomingMessage,
  ])

  // FIX: the canvas is a fixed 1200x800 internal resolution but is stretched
  // to fill a flexible-aspect-ratio container via CSS `object-fit: contain`.
  // Whenever the container's aspect ratio isn't exactly 1200:800, the
  // browser letterboxes the canvas (blank bars top/bottom or left/right) —
  // but `getBoundingClientRect()` still reports the *full element box*,
  // bars included. Mapping pointer coordinates against that full box
  // (as the old code did) causes drawing to drift away from the cursor
  // proportional to how far off-aspect the window is. This computes the
  // actual visible (letterboxed) drawing rect within the element first,
  // then maps against that instead.
  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()

    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT
    const boxAspect = rect.width / rect.height

    let visibleWidth = rect.width
    let visibleHeight = rect.height
    let offsetX = 0
    let offsetY = 0

    if (boxAspect > canvasAspect) {
      // box is wider than the canvas — letterboxed left/right
      visibleWidth = rect.height * canvasAspect
      offsetX = (rect.width - visibleWidth) / 2
    } else if (boxAspect < canvasAspect) {
      // box is taller than the canvas — letterboxed top/bottom
      visibleHeight = rect.width / canvasAspect
      offsetY = (rect.height - visibleHeight) / 2
    }

    const xInBox = event.clientX - rect.left - offsetX
    const yInBox = event.clientY - rect.top - offsetY

    return {
      x: (xInBox / visibleWidth) * CANVAS_WIDTH,
      y: (yInBox / visibleHeight) * CANVAS_HEIGHT,
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
  // FIX: depends on `loading` so it re-runs once the real <canvas> mounts
  // (previously ran once with `[]` while the skeleton was showing, before
  // canvasRef had anything attached, and never fired again).
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

  // FIX: same letterboxing correction as getCanvasPoint, but derived from
  // the already-measured `canvasRect` state (used for the cursor overlay,
  // which needs to map canvas-space coordinates back to screen pixels —
  // the exact inverse problem). Keeping both directions in sync so
  // strokes and cursors never disagree about where the canvas actually is.
  const visibleCanvasBox = React.useMemo(() => {
    if (!canvasRect) return null
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT
    const boxAspect = canvasRect.width / canvasRect.height

    let width = canvasRect.width
    let height = canvasRect.height
    let offsetX = 0
    let offsetY = 0

    if (boxAspect > canvasAspect) {
      width = canvasRect.height * canvasAspect
      offsetX = (canvasRect.width - width) / 2
    } else if (boxAspect < canvasAspect) {
      height = canvasRect.width / canvasAspect
      offsetY = (canvasRect.height - height) / 2
    }

    return { width, height, offsetX, offsetY }
  }, [canvasRect])

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
    const strokeId = `${user.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    currentStrokeIdRef.current = strokeId

    // Announce the stroke immediately so other clients can start
    // rendering segments live, instead of waiting for pointerup.
    if (socketRef.current) {
      socketRef.current.emit("draw:strokeStart", {
        lobbyId,
        strokeId,
        color,
        width,
        point,
      })
    }
  }

  const lastEmitRef = React.useRef(0)

  // FIX: consolidated cursor-emit into a single throttled function.
  // Previously both continueDrawing() and handlePointerMove() independently
  // emitted "draw:cursor" on every pointermove using the *same* lastEmitRef
  // with two different thresholds (50ms / 75ms). Since continueDrawing ran
  // first and updated the shared ref, handlePointerMove's emit was almost
  // always throttled out while actively drawing, and the two call sites
  // could race/step on each other's timing in subtle ways. One function,
  // one threshold.
  const emitCursor = React.useCallback(
    (point: { x: number; y: number }) => {
      if (!socketRef.current) return
      const nowTs = Date.now()
      if (nowTs - lastEmitRef.current > 50) {
        socketRef.current.emit("draw:cursor", {
          lobbyId,
          x: point.x,
          y: point.y,
          color,
        })
        lastEmitRef.current = nowTs
      }
    },
    [lobbyId, color]
  )

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
    emitCursor(point)

    // Stream this point to other clients right away so they can draw the
    // segment live rather than waiting for the stroke to finish. Not
    // throttled like the cursor emit — every point matters for line
    // continuity, and pointermove is already coalesced by the browser.
    if (socketRef.current && currentStrokeIdRef.current) {
      socketRef.current.emit("draw:point", {
        lobbyId,
        strokeId: currentStrokeIdRef.current,
        point,
      })
    }
  }

  const stopDrawing = () => {
    if (!drawingRef.current || !currentStrokeRef.current) {
      drawingRef.current = false
      return
    }

    // Persist the full stroke (server writes this to storage), and tell
    // other clients this strokeId is done so they can clear their
    // in-progress tracking for it.
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

    if (socketRef.current && currentStrokeIdRef.current) {
      socketRef.current.emit("draw:strokeEnd", {
        lobbyId,
        strokeId: currentStrokeIdRef.current,
      })
    }

    currentStrokeRef.current = null
    currentStrokeIdRef.current = null
    drawingRef.current = false
    lastPointRef.current = null
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event)
    if (!point) return
    emitCursor(point)
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

  // FIX: also treat `user === null` (resolved logged-out) as a loading/
  // redirect state rather than falling through to the full render, which
  // previously happened because the old check only tested `undefined`.
  if (loading || user === undefined || user === null) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <div className="h-14 shrink-0 border-b border-border bg-background" />
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <div className="min-w-0 flex-1 animate-pulse rounded-xl bg-muted" />
          <div className="w-[320px] shrink-0 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-background px-4 text-center">
        <p className="mb-4 text-muted-foreground">{error}</p>
        <Button onClick={() => router.push(`/${lobbyId}`)}>
          Back to lobby
        </Button>
      </div>
    )
  }

  const swatches = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"]
  const strokeSizes = [3, 6, 10, 16]

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar — lobby identity, timer, and brush settings all in one reach zone */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push(`/${lobbyId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="shrink-0">
            Live
          </Badge>
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {lobbyName || "Live draw"}
          </h1>
        </div>

        {secondsLeft !== null && (
          <div
            className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-sm font-medium tabular-nums ${
              secondsLeft <= 10 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {Math.floor(secondsLeft / 60)
              .toString()
              .padStart(2, "0")}
            :{(secondsLeft % 60).toString().padStart(2, "0")}
          </div>
        )}

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        {/* Brush settings — inline, compact, always visible */}
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-1.5">
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-label={`Use color ${swatch}`}
                className={`h-6 w-6 shrink-0 rounded-full ring-offset-2 ring-offset-background transition ${
                  color.toLowerCase() === swatch.toLowerCase()
                    ? "ring-2 ring-primary"
                    : "ring-1 ring-border hover:ring-muted-foreground"
                }`}
                style={{ background: swatch }}
              />
            ))}
            <label className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-border hover:ring-muted-foreground">
              <span
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)",
                }}
              />
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Custom color"
              />
            </label>
          </div>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

          <div className="flex shrink-0 items-center gap-1.5">
            {strokeSizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setWidth(size)}
                aria-label={`Stroke width ${size}px`}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                  width === size ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: Math.min(size, 14), height: Math.min(size, 14) }}
                />
              </button>
            ))}
          </div>
        </div>

        <Badge variant="outline" className="shrink-0">
          {participants.length} player{participants.length === 1 ? "" : "s"}
        </Badge>
      </header>

      {/* Body — canvas fills the left, chat column fills the right. No page scroll. */}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Canvas column */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div
              className="relative h-full max-h-full w-full max-w-full bg-white"
              style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="h-full w-full touch-none bg-white"
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
            {/* FIX: guard on visibleCanvasBox (not just canvasRect) so
                cursors are positioned against the actual letterboxed
                drawing area, matching the stroke coordinate math. */}
            {visibleCanvasBox &&
              Object.entries(cursors).map(([id, c]) => {
                // hide stale cursors using stable `now` state
                if (now - c.lastSeen > 5000) return null
                const left = visibleCanvasBox.offsetX + (c.x / CANVAS_WIDTH) * visibleCanvasBox.width
                const top = visibleCanvasBox.offsetY + (c.y / CANVAS_HEIGHT) * visibleCanvasBox.height
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
                        className="rounded-full px-2 py-1 text-xs font-medium"
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
        </div>

        {/* Right column — roster strip + chat, fixed width, own scroll only */}
        <div className="flex w-[320px] shrink-0 flex-col gap-3 overflow-hidden">
          {/* Roster — compact horizontal strip of avatars, not a tall list */}
          <div className="shrink-0 rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {participants.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No players yet.</p>
              ) : (
                participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="shrink-0"
                    title={participant.username}
                  >
                    <Avatar className="h-8 w-8 ring-2 ring-background">
                      <AvatarImage src={stickerImageUrl(participant.stickerId)} />
                      <AvatarFallback className="text-xs">
                        {participant.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat — fills remaining height, streamer-style rows */}
          {chatEnabled ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chat
                </p>
                <span className="text-xs text-muted-foreground">{messages.length}</span>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
                {messages.length === 0 ? (
                  <p className="pt-4 text-center text-xs text-muted-foreground">
                    Say something to your lobby.
                  </p>
                ) : (
                  messages.map((messageItem, index) => {
                    const isMe = messageItem.userId === user.uid
                    return (
                      <div
                        key={`${messageItem.userId}-${messageItem.createdAt}-${index}`}
                        className="flex items-start gap-1.5 rounded-md px-1.5 py-1 leading-snug hover:bg-muted/50"
                      >
                        <img
                          src={stickerImageUrl(messageItem.stickerId)}
                          alt=""
                          className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                        />
                        <p className="min-w-0 wrap-break-word text-[13px]">
                          <span
                            className={`font-semibold ${isMe ? "text-primary" : "text-blue-600"}`}
                          >
                            {messageItem.username}
                          </span>
                          <span className="text-muted-foreground">{"  "}</span>
                          <span className="text-foreground/90">{messageItem.body}</span>
                        </p>
                      </div>
                    )
                  })
                )}
              </div>

              <form
                onSubmit={handleSendMessage}
                className="flex shrink-0 items-center gap-2 border-t border-border p-2.5"
              >
                <Input
                  id="chat-input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Send a message"
                  maxLength={500}
                  className="h-8 text-[13px]"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={!message.trim() || isSending}
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-background p-4 text-center text-xs text-muted-foreground">
              Chat is disabled for this lobby.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}