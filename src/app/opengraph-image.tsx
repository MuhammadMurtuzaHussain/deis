import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { BRICOLAGE, markFont } from "@/lib/brand/font";
import { INK, POP } from "@/lib/brand/icon";

// The link preview for the hosted demo and the DEV post (PRD-16), in v3 "Highlighter": the
// cool grey page, the lowercase Bricolage wordmark with its lime square, and the deck card with
// one CV line under the highlighter. Generated once at build time. Bricolage is read from the
// repo (src/lib/brand); Geist comes from Google Fonts as TTF (next/og can't read woff2), and if
// that fetch fails the image still builds in the default face.

export const alt = "Deis: early-career jobs in Ireland, with a CV tailored by open-weight Gemma and every line traced to your own facts.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#F5F5F4";
const SURFACE = "#FFFFFF";
const SUNKEN = "#EDEDEC";
const INK2 = "#4B4D52";
const INK3 = "#6B6E74";
const LINE = "#E3E3E1";
const POP_SOFT = "#ECFBC2";
const WARN = "#9A5B00";
const WARN_SOFT = "#FFF1D6";
// CompanyMark's tile for "Corrib Health": hsl(companyHue 35% 88%).
const MARK = "hsl(225 35% 88%)";

/** One face from Google Fonts as TTF, or null when it can't be fetched. family: "Geist:wght@400". */
async function googleFont(family: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}`, { signal: AbortSignal.timeout(8000) })).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** A glyph tile for a "how you match" line: 30 px circle, a simple stroke icon inside. */
function Tile({ bg, children }: { bg: string; children: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, background: bg, flexShrink: 0 }}>{children}</div>;
}

export default async function Image() {
  const [display, geist, geistMedium] = await Promise.all([markFont(), googleFont("Geist:wght@400"), googleFont("Geist:wght@500")]);
  // Body text first: the first font is the default for everything without a fontFamily.
  const fonts = [
    ...(geist ? [{ name: "Geist", data: geist, style: "normal" as const, weight: 400 as const }] : []),
    ...(geistMedium ? [{ name: "Geist", data: geistMedium, style: "normal" as const, weight: 500 as const }] : []),
    ...display,
  ];

  const lines: { kind: "strong" | "carries" | "gap"; text: string }[] = [
    { kind: "strong", text: "Built Power BI dashboards for 5 managers" },
    { kind: "carries", text: "MSc thesis forecasting in Python" },
    { kind: "gap", text: "No healthcare data yet" },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, padding: "60px 72px", color: INK, fontFamily: geist ? "Geist" : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 580 }}>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: -2 }}>deis</span>
            <span style={{ width: 13, height: 13, borderRadius: 2, background: POP, marginLeft: 6, marginBottom: 11 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <span style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 84, lineHeight: 0.98, letterSpacing: -2.6 }}>Jobs you can actually get.</span>
            <span style={{ fontSize: 28, lineHeight: 1.35, color: INK2 }}>Early-career roles in Ireland. A CV tailored by open-weight Gemma, every line traced to your facts.</span>
          </div>
          <span style={{ fontSize: 22, color: INK3 }}>Open source, AGPL-3.0</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", flex: 1, gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 430, padding: 28, borderRadius: 28, background: SURFACE, border: `1px solid ${LINE}`, boxShadow: "0 18px 40px -18px rgba(14,15,16,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, background: MARK, fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 15 }}>CH</div>
              <span style={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Corrib Health</span>
              <span style={{ fontSize: 14, color: INK3 }}>3d ago</span>
            </div>
            <span style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 38, lineHeight: 1.04, letterSpacing: -1.1, marginTop: 18 }}>Graduate Data Analyst</span>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {["Galway", "Early career"].map((p) => (
                <span key={p} style={{ fontSize: 14, padding: "4px 12px", borderRadius: 999, border: `1px solid ${LINE}`, color: INK2 }}>
                  {p}
                </span>
              ))}
              <span style={{ fontSize: 14, padding: "4px 12px", borderRadius: 999, background: POP_SOFT, color: INK }}>Strong match</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
              {lines.map((l) => (
                <div key={l.text} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 17 }}>
                  {l.kind === "strong" ? (
                    <Tile bg={POP_SOFT}>
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Tile>
                  ) : l.kind === "carries" ? (
                    <Tile bg={SUNKEN}>
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M2.5 5.5h11M10.5 2.5l3 3-3 3M13.5 10.5h-11M5.5 7.5l-3 3 3 3" fill="none" stroke={INK2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Tile>
                  ) : (
                    <Tile bg={WARN_SOFT}>
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="5.5" fill="none" stroke={WARN} strokeWidth="1.8" strokeDasharray="2.6 2.2" />
                      </svg>
                    </Tile>
                  )}
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: 430, padding: "14px 18px", borderRadius: 20, background: "#FFFFFF", border: `1px solid ${LINE}`, fontSize: 16, color: INK }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: POP_SOFT, fontSize: 11 }}>1</span>
            <span style={{ background: POP_SOFT, padding: "2px 4px", borderRadius: 3 }}>Built Power BI dashboards for 5 regional managers.</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
