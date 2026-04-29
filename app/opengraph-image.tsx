import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background:
            "radial-gradient(circle at top left, rgba(239,68,68,0.24), transparent 28%), radial-gradient(circle at right, rgba(56,189,248,0.18), transparent 24%), linear-gradient(180deg, #111111 0%, #090909 100%)",
          color: "#fafafa",
          padding: "72px",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "Arial",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          NicheFinder.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "860px" }}>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700, lineHeight: 1.05 }}>
            Find YouTube niches with real outliers.
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#d4d4d4", lineHeight: 1.4 }}>
            Search niches, inspect saturation, compare similar channels, and estimate revenue.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
