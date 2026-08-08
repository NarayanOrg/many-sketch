// Curated set of Twemoji presets for profile pictures.
// stickerId format: "twemoji:<unicode-codepoint>"
// Rendered via the jsdelivr Twemoji CDN — no need to self-host assets.

export interface StickerPreset {
  id: string;
  emoji: string;
  label: string;
}

export const STICKER_PRESETS: StickerPreset[] = [
  { id: "twemoji:1f981", emoji: "🦁", label: "Lion" },
  { id: "twemoji:1f43c", emoji: "🐼", label: "Panda" },
  { id: "twemoji:1f98a", emoji: "🦊", label: "Fox" },
  { id: "twemoji:1f435", emoji: "🐵", label: "Monkey" },
  { id: "twemoji:1f42f", emoji: "🐯", label: "Tiger" },
  { id: "twemoji:1f428", emoji: "🐨", label: "Koala" },
  { id: "twemoji:1f984", emoji: "🦄", label: "Unicorn" },
  { id: "twemoji:1f419", emoji: "🐙", label: "Octopus" },
  { id: "twemoji:1f426", emoji: "🐦", label: "Bird" },
  { id: "twemoji:1f438", emoji: "🐸", label: "Frog" },
  { id: "twemoji:1f989", emoji: "🦉", label: "Owl" },
  { id: "twemoji:1f43b", emoji: "🐻", label: "Bear" },
];

export function stickerIdToCodepoint(stickerId: string): string {
  return stickerId.replace("twemoji:", "");
}

export function stickerImageUrl(stickerId: string): string {
  const codepoint = stickerIdToCodepoint(stickerId);
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoint}.png`;
}