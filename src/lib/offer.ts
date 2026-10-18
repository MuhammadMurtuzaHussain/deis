// The October launch offer: 80% off the desktop licence with a Polar discount code.
// The code itself lives in Polar (Products > Discounts, "Exclusive Hacktoberfest Discount",
// code hacktoberfest2026); this file shows it, /checkout applies it, and this says when it ends.
// The Polar discount has no end date of its own, so after October it still works if typed.
// Midnight UTC on 1 November is midnight in Ireland too.

export const OFFER = {
  code: "hacktoberfest2026",
  percentOff: 80,
  price: "€2",
  endsAt: "2026-11-01T00:00:00Z",
} as const;

export const offerOn = (now: number = Date.now()) => now < Date.parse(OFFER.endsAt);
