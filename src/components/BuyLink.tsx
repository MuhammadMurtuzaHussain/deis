"use client";

import type { ReactNode } from "react";
import { buttonClass } from "./ui";

// The buy button as a link. buttonClass is a client helper, so pages that are server components use this.
export function BuyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${buttonClass("primary", "lg")} w-fit`}>
      {children}
    </a>
  );
}
