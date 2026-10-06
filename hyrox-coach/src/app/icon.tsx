import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#d7ff3c",
          fontSize: 260,
          fontWeight: 800,
          letterSpacing: -16,
        }}
      >
        HX
      </div>
    ),
    size,
  );
}
