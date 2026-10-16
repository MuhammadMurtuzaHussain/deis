import { parseSerpKey, SERPAPI_HEADER } from "@/lib/serpapi";
import { jsonError } from "@/lib/server/api";
import { serpAccount } from "@/lib/server/feed";
import { isOfflineMode } from "@/lib/server/net";

export const runtime = "nodejs";

// Checks the user's own SerpApi key and says how many searches it has left. The key comes in
// the x-deis-serpapi header, goes to serpapi.com's account API (which doesn't use a search),
// and is never stored or logged here. Another site can't call this: a custom header makes the
// browser ask first, and Deis never says yes.
export async function GET(req: Request) {
  if (isOfflineMode()) return jsonError("offline", "Offline mode is on, so Deis can't check the key. It's saved and will be used when you're back online.", 503);
  const key = parseSerpKey(req.headers.get(SERPAPI_HEADER));
  if (!key) return jsonError("serpapi_key", "That doesn't look like a SerpApi key. Copy the whole private API key from your SerpApi dashboard.", 400);
  const got = await serpAccount(key);
  if (!got.ok) {
    return got.reason === "invalid"
      ? jsonError("serpapi_key", "SerpApi didn't accept this key. Check you copied the whole private API key.", 400)
      : jsonError("network", "Couldn't reach SerpApi to check the key. Try again in a minute.", 502);
  }
  return Response.json({ ok: true, left: got.left });
}
