import { webhooks } from "@polar-sh/sdk/2026-10";

export const runtime = "nodejs";

// Polar's webhooks, verified against POLAR_WEBHOOK_SECRET before anything is read.
// Deis needs nothing here yet: the licence key Polar issues is checked by the desktop app itself.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return Response.json({ received: false }, { status: 503 });
  const body = await request.text(); // the raw body, not parsed JSON
  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(
      body,
      {
        "webhook-id": request.headers.get("webhook-id") ?? "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": request.headers.get("webhook-signature") ?? "",
      },
      secret,
    );
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) return Response.json({ received: false }, { status: 403 });
    if (error instanceof webhooks.PolarWebhookError) return Response.json({ received: false }, { status: 400 });
    throw error;
  }

  switch (event.type) {
    case "order.paid":
      // TODO: a sale. Nothing to grant here (the licence key benefit does that); count it for the post?
      break;
    case "customer.state_changed":
      // TODO: a customer's benefits changed (e.g. a refund revoked their licence key).
      break;
  }
  return Response.json({ received: true });
}
