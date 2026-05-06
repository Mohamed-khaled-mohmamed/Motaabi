import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motaabi - Student Attendance",
  description: "Real-time student attendance management",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
