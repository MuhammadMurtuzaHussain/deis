"use client";

import { EnvelopeSimple, LinkedinLogo } from "@phosphor-icons/react";
import { SUPPORT_EMAIL } from "@/lib/product";

// Deis's LinkedIn page, in the footers and on Welcome. A client component so server pages
// (/download) can use it: the icons are client-side.
export const LINKEDIN_URL = "https://www.linkedin.com/company/deiscareers/";

/** `underline` is off where the anchor already carries the .link style. */
export function LinkedInLink({ size = 16, className = "", label = "LinkedIn", underline = true }: { size?: number; className?: string; label?: string; underline?: boolean }) {
  return (
    <a href={LINKEDIN_URL} target="_blank" rel="noreferrer noopener" className={`inline-flex min-h-11 items-center gap-2 ${className}`}>
      <LinkedinLogo size={size} aria-hidden />
      <span className={underline ? "underline underline-offset-2" : undefined}>{label}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The support inbox as a mail link. The address itself is the label by default, so it can be copied where mail links don't open. */
export function SupportLink({ size = 16, className = "", label = SUPPORT_EMAIL, underline = true }: { size?: number; className?: string; label?: string; underline?: boolean }) {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={`inline-flex min-h-11 items-center gap-2 ${className}`}>
      <EnvelopeSimple size={size} aria-hidden />
      <span className={underline ? "underline underline-offset-2" : undefined}>{label}</span>
    </a>
  );
}
