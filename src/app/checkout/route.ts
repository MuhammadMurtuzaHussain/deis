import { polar } from "@/lib/server/polar";

export const runtime = "nodejs";

// /checkout?products=<id>: opens a Polar checkout for the desktop app and redirects to it.
// No success URL: Polar shows its own confirmation and emails the licence key.
export async function GET(request: Request): Promise<Response> {
  const products = new URL(request.url).searchParams.getAll("products");
  if (products.length === 0) return Response.json({ error: "Missing products in query params" }, { status: 400 });
  try {
    const result = await polar.checkouts.create({ products });
    return Response.redirect(result.url, 302);
  } catch (error) {
    console.error("[polar] checkout", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
}
