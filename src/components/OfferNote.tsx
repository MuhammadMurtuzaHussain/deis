"use client";

import { Tag } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { OFFER, offerOn } from "@/lib/offer";

// The October offer line under a price. It reads the clock in the browser, so a page
// built in October stops showing it on 1 November without a rebuild; the server render
// shows nothing, which keeps hydration stable.

const noSubscribe = () => () => {};

export function OfferNote({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(noSubscribe, () => offerOn(), () => false);
  if (!on) return null;
  return (
    <p className={`grid grid-cols-[18px_1fr] items-start gap-2 text-body text-ink-2 ${className}`}>
      <Tag size={18} weight="bold" aria-hidden className="mt-[3px] text-ink" />
      <span>
        October only: {OFFER.percentOff}% off with the code{" "}
        <span className="highlight rounded-sm px-1 font-mono text-[0.95em] font-semibold text-ink" data-on="true">
          {OFFER.code}
        </span>
        , applied for you at checkout, so {OFFER.price} instead of €9.99.
      </span>
    </p>
  );
}
