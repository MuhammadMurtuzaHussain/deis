// The Deis mark: an italic D on the estuary-green tile, leaning forward the way a swipe
// right does. One source for the favicon, the Apple touch icon and the desktop app icon.
export function Mark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#17694f",
        borderRadius: size * 0.22,
        color: "#f3f5f4",
        fontFamily: "Atkinson",
        fontSize: size * 0.68,
        fontStyle: "italic",
        fontWeight: 700,
        letterSpacing: -size * 0.02,
        paddingBottom: size * 0.04,
        paddingRight: size * 0.03,
      }}
    >
      D
    </div>
  );
}
