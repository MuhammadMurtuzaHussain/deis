import { OFFER, offerOn } from "@/lib/offer";
import { polar } from "@/lib/server/polar";

export const runtime = "nodejs";

// /checkout?products=<id>: opens a Polar checkout for the desktop app and redirects to it.
// No success URL: Polar shows its own confirmation and emails the licence key.
// In October the HACKTOBERFEST discount is applied for the buyer when Polar has it; if the
// lookup fails, checkout still opens and the code can be typed in by hand.
// Without a product (someone typing /checkout), send them to the buy section instead of a JSON error.
export async function GET(request: Request): Promise<Response> {
  const products = new URL(request.url).searchParams.getAll("products");
  if (products.length === 0) return Response.redirect(new URL("/download#buy", request.url), 302);
  try {
    const discountId = offerOn() ? await offerDiscountId() : null;
    const result = await polar.checkouts.create({ products, ...(discountId ? { discount_id: discountId } : {}) });
    return Response.redirect(result.url, 302);
  } catch (error) {
    console.error("[polar] checkout", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
}

async function offerDiscountId(): Promise<string | null> {
  try {
    const { items } = await polar.discounts.list({ query: OFFER.code, limit: 10 });
    return items.find((d) => d.code?.toUpperCase() === OFFER.code)?.id ?? null;
  } catch (error) {
    console.error("[polar] discount lookup", error instanceof Error ? error.message : error);
    return null;
  }
}
