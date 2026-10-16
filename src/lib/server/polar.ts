import { createPolar } from "@polar-sh/sdk/2026-10";

// One Polar client for the checkout and webhook routes. The environment comes from
// POLAR_SERVER, so moving between sandbox and production is an env change only.
// The desktop licence check doesn't use this: it calls Polar's public key check (licence.ts).
export const polar = createPolar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  environment: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
});
