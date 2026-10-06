import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HYROX Coach", template: "%s · HYROX Coach" },
  description: "トレーニングするだけ。記録・分析・メニュー作りは AI コーチが回します。",
  applicationName: "HYROX Coach",
  appleWebApp: { capable: true, title: "HYROX Coach", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
