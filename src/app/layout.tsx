import {DeviceSync} from '@/components/device-sync';
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./after-hours.css";

const geistSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});



const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bullproof — Stock discovery & research",
    template: "%s | Bullproof",
  },
  description:
    "Discover companies from fresh SEC filings. Explore financial history, interactive market charts, sourced signals, and your research watchlist.",
  applicationName: "Bullproof",
  appleWebApp: { capable: true, title: "Bullproof", statusBarStyle: "default" },
  icons: { apple: [{ url: "/apple-touch-icon.png?v=20261029-bull", sizes: "180x180", type: "image/png" }], icon: [{url: "/icons/bullproof-32.png?v=20261029-bull", sizes: "32x32", type: "image/png"}] },
  keywords: ["stocks", "market movers", "stock screener", "market research"],
  openGraph: {
    title: "Bullproof",
    description: "Fresh filings. Real data. A reason to look closer.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1218",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="after-hours">{children}<DeviceSync/></body>
    </html>
  );
}
