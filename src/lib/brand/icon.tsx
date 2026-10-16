// The Deis mark (v3 "Highlighter"): a lowercase "d" in Bricolage 800 on an ink tile, with
// the wordmark's lime square beside it. One source for the favicon, the Apple touch icon and
// the desktop app icon (scripts/make-icon.mts), the web app icons and the Android launcher icons
// (scripts/make-app-icons.mts). Needs markFont() from ./font.
export const INK = "#0E0F10";
export const PAPER = "#F2F2F3";
export const POP = "#C8F03C";

/** shape: "tile" is the rounded icon, "circle" Android's round launcher icon, "none" the mark
 * alone on a clear canvas (for icons the system masks itself). */
export function Mark({ size, shape = "tile" }: { size: number; shape?: "tile" | "circle" | "none" }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: shape === "none" ? "transparent" : INK,
        borderRadius: shape === "circle" ? size / 2 : shape === "tile" ? size * 0.22 : 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", marginLeft: size * 0.06, marginTop: -size * 0.02 }}>
        <span style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: size * 0.76, lineHeight: 1, letterSpacing: -size * 0.02, color: PAPER }}>d</span>
        <span style={{ width: size * 0.15, height: size * 0.15, borderRadius: size * 0.025, background: POP, marginLeft: size * 0.035, marginBottom: size * 0.165 }} />
      </div>
    </div>
  );
}
