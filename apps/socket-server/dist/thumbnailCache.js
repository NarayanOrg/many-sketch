const MAX_ENTRIES = 500;
const cache = new Map();
export function getCachedThumbnail(lobbyId) {
    return cache.get(lobbyId);
}
export function setCachedThumbnail(lobbyId, buffer) {
    if (cache.size >= MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey)
            cache.delete(oldestKey);
    }
    cache.set(lobbyId, buffer);
}
