const MAX_ENTRIES = 500;

const cache = new Map<string, Buffer>();

export function getCachedThumbnail(lobbyId: string): Buffer | undefined {
  return cache.get(lobbyId);
}

export function setCachedThumbnail(lobbyId: string, buffer: Buffer) {
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(lobbyId, buffer);
}