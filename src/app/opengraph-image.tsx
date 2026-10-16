import { ImageResponse } from "next/og";

// The link preview for the hosted demo and the DEV post (PRD-16): the Estuary paper
// palette, the Newsreader wordmark and a small index card. Generated once at build time.
// Newsreader and Atkinson come from Google Fonts as TTF (next/og can't read woff2); if a fetch
// fails the image still builds, in the default face.

export const alt = "Deis: early-career jobs in Ireland, with a CV tailored by open-weight Gemma and every line traced to your own facts.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#F4F1EA";
const RAISED = "#FFFFFF";
const INK = "#1A1E1C";
const INK2 = "#4A524E";
const INK3 = "#5E6661";
const LINE = "#DDD6C8";
const ACCENT = "#0F5C45";
const ACCENT_SOFT = "#DCEBE3";
const ACCENT_TEXT = "#0C4A37";
const TRACE = "#2D5B8A";

/** One face from Google Fonts as TTF, or null when it can't be fetched. family: "Newsreader:wght@500". */
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

const HERO = "Jobs you can actually get.";
const CARD_TITLE = "Graduate Data Analyst";

export default async function Image() {
  const [body, italic, roman] = await Promise.all([googleFont("Atkinson+Hyperlegible+Next:wght@400"), googleFont("Newsreader:ital,wght@1,500"), googleFont("Newsreader:wght@500")]);
  // Body text first: the first font is the default for everything without a fontFamily.
  const fonts = [
    ...(body ? [{ name: "Atkinson Hyperlegible Next", data: body, style: "normal" as const, weight: 400 as const }] : []),
    ...(italic ? [{ name: "Newsreader Italic", data: italic, style: "italic" as const, weight: 500 as const }] : []),
    ...(roman ? [{ name: "Newsreader", data: roman, style: "normal" as const, weight: 500 as const }] : []),
  ];
  const display = roman ? "Newsreader" : undefined;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, padding: "64px 72px", color: INK, fontFamily: body ? "Atkinson Hyperlegible Next" : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 620 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontFamily: italic ? "Newsreader Italic" : undefined, fontStyle: "italic", fontSize: 64, lineHeight: 1 }}>Deis</span>
            <span style={{ fontSize: 18, letterSpacing: 4, color: INK3 }}>OPPORTUNITY</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <span style={{ fontFamily: display, fontSize: 76, lineHeight: 1.02, letterSpacing: -1 }}>{HERO}</span>
            <span style={{ fontSize: 28, lineHeight: 1.35, color: INK2 }}>Early-career roles in Ireland. A CV tailored by open-weight Gemma, every line traced to something you told it.</span>
          </div>
          <span style={{ fontSize: 22, color: INK3 }}>Open source, AGPL-3.0</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", right: 24, top: 150, width: 380, height: 330, borderRadius: 20, background: "#FFFDF8", border: `1px solid ${LINE}` }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 400,
              padding: 28,
              borderRadius: 20,
              background: RAISED,
              border: `1px solid ${LINE}`,
              boxShadow: "0 8px 24px -8px rgba(26,30,28,0.18)",
              transform: "rotate(-2deg)",
            }}
          >
            <span style={{ fontSize: 16, letterSpacing: 2, color: INK2 }}>CORRIB HEALTH</span>
            <span style={{ fontFamily: display, fontSize: 34, lineHeight: 1.1, marginTop: 6 }}>{CARD_TITLE}</span>
            <span style={{ fontSize: 18, color: INK2, marginTop: 10 }}>Galway · €34,000 to €38,000</span>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <span style={{ fontSize: 15, padding: "4px 12px", borderRadius: 999, border: `1px solid ${LINE}`, color: INK2 }}>Early career</span>
              <span style={{ fontSize: 15, padding: "4px 12px", borderRadius: 999, background: ACCENT_SOFT, color: ACCENT_TEXT }}>Good fit</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
              {["Built Power BI dashboards for 5 managers", "Python forecasting from the MSc thesis"].map((t, i) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      fontSize: 13,
                      color: i === 0 ? "#FFFFFF" : TRACE,
                      background: i === 0 ? TRACE : RAISED,
                      border: `1.5px solid ${TRACE}`,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <span style={{ fontSize: 17, padding: "10px 22px", borderRadius: 999, background: ACCENT, color: "#FFFFFF" }}>Apply</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
