# Polar setup

Deis sells the desktop app through Polar. Organisation: `deis` (`d1209e45-3973-4c02-a758-1665cb7980e5`). Environment: **production**: these are live payments.

## How it fits together

- **Product:** "Deis", €9.99 one-time, with a **licence key** benefit. Id: `fb94fe7f-d0f8-49a0-8854-4bbe41f25496`.
- **Buying:** the desktop app's Buy button opens `https://deis-bu83.onrender.com/checkout?products=fb94fe7f-d0f8-49a0-8854-4bbe41f25496`. That route creates a Polar checkout and redirects to it. Polar shows its own confirmation and emails the licence key.
- **Unlocking:** the desktop app checks the key with Polar's public licence-key endpoint (`src/lib/server/licence.ts`): online once, then trusted offline and re-checked monthly. The app holds no secret.
- **Customer portal:** Polar hosts it and emails customers the link. No app code is needed.

## Files

| File | What it does |
|---|---|
| `src/lib/server/polar.ts` | One SDK client (`@polar-sh/sdk`, API version `2026-10`). The environment comes from `POLAR_SERVER`. |
| `src/app/checkout/route.ts` | `GET /checkout?products=<id>` redirects to a Polar checkout. |
| `src/app/api/webhook/polar/route.ts` | `POST /api/webhook/polar` verifies the signature (`POLAR_WEBHOOK_SECRET`), with TODO stubs for `order.paid` and `customer.state_changed`. It returns 503 until a secret is set. |
| `desktop/config.json` | `polarOrganizationId` and `buyUrl`. These turn on the 14-day trial and the licence screen in the packaged app. |
| `render.yaml`, `.env.example` | The env keys below. |

## Env keys (names only)

- `POLAR_ACCESS_TOKEN`: an organisation access token (production) with the checkouts scope. It's needed on the server that serves `/checkout`.
- `POLAR_WEBHOOK_SECRET`: set once a webhook endpoint is registered.
- `POLAR_SERVER`: `production` (or `sandbox`).

These are set locally in `.env.local`, and in Render's dashboard for the hosted demo.

## Webhook

Not registered yet: there's no public deploy of `/api/webhook/polar`. After the next Render deploy:
1. Polar dashboard → Settings → Webhooks → add `https://deis-bu83.onrender.com/api/webhook/polar`, format **raw**, with the events `order.paid` and `customer.state_changed`.
2. Copy the signing secret into Render as `POLAR_WEBHOOK_SECRET`.

Deis doesn't need webhooks to sell or unlock, because the licence key does both. They're useful only for counting sales.

## Before relying on it

- [ ] Render: set `POLAR_ACCESS_TOKEN` (and `POLAR_SERVER=production`), then deploy.
- [ ] Open the buy URL above and check it reaches the Polar checkout for "Deis".
- [ ] Make a 100% discount code in the Polar dashboard. Buy with it to get a real licence key without a charge, enter that key in the desktop app (built with this `desktop/config.json`), and check it unlocks.
- [ ] Optional: register the webhook (above).
- [ ] The price shown in the app and the post is €9; the Polar product is €9.99. Make them match.
