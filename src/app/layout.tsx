import type { Metadata, Viewport } from "next";
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google";
import "@/components/calls/base.css";

// Variable names are kept from the previous layout because the legacy /research styles read them.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bullproof",
    template: "%s | Bullproof",
  },
  description: "Earnings calls locked before the release and graded on the close.",
  applicationName: "Bullproof",
  appleWebApp: { capable: true, title: "Bullproof", statusBarStyle: "default" },
  icons: {
    apple: [{ url: "/apple-touch-icon.png?v=20261029-bull", sizes: "180x180", type: "image/png" }],
    icon: [{ url: "/icons/bullproof-32.png?v=20261029-bull", sizes: "32x32", type: "image/png" }],
  },
  openGraph: {
    title: "Bullproof",
    description: "Earnings calls locked before the release and graded on the close.",
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
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}>
      {/* `after-hours` is the hook the legacy /research stylesheets are scoped to; it styles nothing on its own. */}
      <body className="after-hours">{children}</body>
    </html>
  );
}
