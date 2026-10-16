// The October launch offer: 80% off the desktop licence with a Polar discount code.
// The code itself lives in Polar (Products > Discounts, code HACKTOBERFEST); this file only
// shows it and says when it ends. Midnight UTC on 1 November is midnight in Ireland too.

export const OFFER = {
  code: "HACKTOBERFEST",
  percentOff: 80,
  price: "€2",
  endsAt: "2026-11-01T00:00:00Z",
} as const;

export const offerOn = (now: number = Date.now()) => now < Date.parse(OFFER.endsAt);
