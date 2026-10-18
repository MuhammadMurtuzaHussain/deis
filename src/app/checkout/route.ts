import { OFFER, offerOn } from "@/lib/offer";
import { polar } from "@/lib/server/polar";

export const runtime = "nodejs";

// /checkout?products=<id>: opens a Polar checkout for the desktop app and redirects to it.
// No success URL: Polar shows its own confirmation and emails the licence key.
// In October the offer code is applied to the checkout by name, through Polar's public checkout
// endpoint (the one the checkout page itself uses), so the server token needs no discounts scope.
// If Polar refuses the code, checkout still opens at full price and the code can be typed in by hand.
// Without a product (someone typing /checkout), send them to the buy section instead of a JSON error.
export async function GET(request: Request): Promise<Response> {
  const products = new URL(request.url).searchParams.getAll("products");
  // A relative Location, so the redirect never depends on which host the proxy passed through.
  if (products.length === 0) return new Response(null, { status: 302, headers: { location: "/download#buy" } });
  try {
    const result = await polar.checkouts.create({ products });
    if (offerOn()) await applyOfferCode(result.client_secret);
    return Response.redirect(result.url, 302);
  } catch (error) {
    console.error("[polar] checkout", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
}

const API = process.env.POLAR_SERVER === "sandbox" ? "https://sandbox-api.polar.sh" : "https://api.polar.sh";

/** True when Polar applied the code. Never throws: a refused or slow code leaves the checkout at full price. */
export async function applyOfferCode(clientSecret: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/v1/checkouts/client/${encodeURIComponent(clientSecret)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discount_code: OFFER.code }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[polar] offer code", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (error) {
    console.error("[polar] offer code", error instanceof Error ? error.message : error);
    return false;
  }
}
