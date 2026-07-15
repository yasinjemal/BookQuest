import { ImageResponse } from "next/og";

export const alt = "BookQuest — turn trusted documents into interactive courses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#0a211b",
        color: "white",
        padding: "68px 76px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ position: "absolute", width: 520, height: 520, borderRadius: 520, right: -130, top: -170, background: "#248c8d", opacity: 0.45 }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: 300, right: 110, bottom: -180, background: "#d8ff63", opacity: 0.3 }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: "#d8ff63", color: "#183029", display: "flex", alignItems: "center", justifyContent: "center" }}>BQ</div>
          BookQuest
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 870 }}>
          <div style={{ color: "#d8ff63", fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Source-backed course creation</div>
          <div style={{ marginTop: 22, fontSize: 72, lineHeight: 1.02, letterSpacing: -3, fontWeight: 700 }}>Turn trusted documents into interactive courses.</div>
          <div style={{ marginTop: 24, color: "rgba(255,255,255,.72)", fontSize: 27 }}>Editable lessons · Quizzes · Progress · Evidence · Offline access</div>
        </div>
      </div>
    </div>,
    size,
  );
}

