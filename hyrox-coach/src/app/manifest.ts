import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HYROX AI Coach",
    short_name: "HYROX Coach",
    description: "トレーニングするだけ。記録・分析・メニュー作りは AI コーチが回します。",
    lang: "ja",
    start_url: "/today",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
