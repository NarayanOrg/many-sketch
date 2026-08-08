"use client"
import React from "react"
import { Button } from "@/components/ui/button"
import { Copy, Download, Share2 } from "lucide-react"

interface GalleryActionsProps {
  title: string
  imageUrl: string
  shareUrl: string
}

export default function GalleryActions({
  title,
  imageUrl,
  shareUrl,
}: GalleryActionsProps) {
  const [copied, setCopied] = React.useState(false)

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl })
        return
      }
    } catch {
      // ignore share failures
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy share link", err)
    }
  }

  return (
    <div className="mt-4 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
      <a
        href={imageUrl}
        download={`${title || "drawing"}.png`}
        className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 sm:w-auto"
      >
        <Download className="mr-2 h-4 w-4" />
        Download PNG
      </a>
      <Button
        onClick={handleShare}
        className="inline-flex w-full items-center justify-center sm:w-auto"
      >
        <Share2 className="mr-2 h-4 w-4" />
        {copied ? "Copied link" : "Share drawing"}
      </Button>
    </div>
  )
}
