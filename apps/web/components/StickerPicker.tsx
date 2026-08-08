"use client"
import Image from "next/image"
import { STICKER_PRESETS, stickerImageUrl } from "@/lib/stickers"
import { cn } from "@/lib/utils"

interface StickerPickerProps {
  value: string | null
  onChange: (stickerId: string) => void
}

export default function StickerPicker({ value, onChange }: StickerPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {STICKER_PRESETS.map((sticker) => {
        const selected = value === sticker.id
        return (
          <button
            key={sticker.id}
            type="button"
            onClick={() => onChange(sticker.id)}
            aria-label={sticker.label}
            aria-pressed={selected}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl border-2 bg-muted/40 transition-colors hover:bg-muted",
              selected
                ? "border-foreground bg-muted"
                : "border-transparent"
            )}
          >
            <Image
              src={stickerImageUrl(sticker.id)}
              alt={sticker.label}
              width={36}
              height={36}
              unoptimized
            />
          </button>
        )
      })}
    </div>
  )
}