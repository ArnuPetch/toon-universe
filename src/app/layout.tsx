import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  weight: ["400", "600", "700"],
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "Toon Universe",
  description: "อ่านมังงะ มังฮวา และการ์ตูนออนไลน์",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
