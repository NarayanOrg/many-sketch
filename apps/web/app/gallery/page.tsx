"use client"
import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import GalleryActions from "@/components/GalleryActions"

interface GalleryItem {
  id: string
  title: string
  thumbnailUrl: string
  createdAt: string
}

export default function GalleryPage() {
  const searchParams = useSearchParams()
  const focusedLobbyId = searchParams.get("focus")
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadGallery() {
      try {
        const response = await fetch("/api/gallery")
        if (!response.ok) throw new Error("Failed to load gallery")
        const data = await response.json()
        if (mounted) setItems(data.items ?? [])
      } catch (err) {
        console.error(err)
        if (mounted) setError("Unable to load gallery items.")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadGallery()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!focusedLobbyId || items.length === 0) return
    const target = document.querySelector<HTMLElement>(
      `[data-gallery-id="${focusedLobbyId}"]`
    )
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [focusedLobbyId, items])

  // capture window origin on client to avoid using `window` during render/prerender
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrigin(window.location.origin)
    } catch (e) {
      setOrigin(null)
    }
  }, [])

  return (
    <Suspense fallback={<GalleryLoading />}>
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Gallery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Completed drawings are stored here after a lobby ends.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          Back to home
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="h-48 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-destructive">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">
          No completed drawings yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              data-gallery-id={item.id}
              className="rounded-3xl border border-border bg-background p-4"
            >
              <div className="overflow-hidden rounded-3xl border border-border bg-white">
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="h-48 w-full object-cover"
                />
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <p className="text-base font-semibold">
                    {item.title || "Completed drawing"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <GalleryActions
                  title={item.title || "drawing"}
                  imageUrl={item.thumbnailUrl}
                  shareUrl={origin ? `${origin}/gallery/${item.id}` : ""}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </Suspense>
  )
}


function GalleryLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      Loading gallery...
    </div>
  );
}