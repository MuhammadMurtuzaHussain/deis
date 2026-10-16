// The user's own SerpApi key, for when the shared demo key's monthly budget runs out. It lives
// on the user's device and rides along with feed requests in one header, like the model choice
// (ai/settings.ts). The server sends it to serpapi.com and nowhere else, and never stores or logs it.

export const SERPAPI_HEADER = "x-deis-serpapi";

export const SERPAPI_SIGN_UP = "https://serpapi.com/users/sign_up";

/** A SerpApi key is 64 hex characters; anything key-shaped is accepted, anything else is null. */
export function parseSerpKey(v: string | null | undefined): string | null {
  const k = v?.trim();
  return k && /^[A-Za-z0-9_-]{20,128}$/.test(k) ? k : null;
}

/** Every copy of the key, and anything key-shaped, out of a message before it's logged or thrown. */
export function hideKey(message: string, key: string | null | undefined): string {
  const out = key ? message.split(key).join("[key]") : message;
  return out.replace(/api_key=[^&\s"]+/g, "api_key=[key]");
}
