// The desktop app's Next.js server cache, in memory. The default handler writes rendered
// pages to .next/server/route-cache, which in the desktop app is inside the signed app
// bundle: writing there breaks the macOS signature, and a quarantined copy is read-only.
// Used only by desktop builds (DEIS_DESKTOP_BUILD=1, scripts/desktop-prepare.mjs).
const store = new Map();

module.exports = class MemoryCacheHandler {
  async get(key) {
    return store.get(key) ?? null;
  }

  async set(key, data, ctx) {
    store.set(key, { value: data, lastModified: Date.now(), tags: ctx?.tags ?? [] });
  }

  async revalidateTag(tags) {
    const gone = [tags].flat();
    for (const [key, entry] of store) if (entry.tags.some((t) => gone.includes(t))) store.delete(key);
  }

  resetRequestCache() {}
};
