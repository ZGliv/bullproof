import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Bullproof", short_name: "Bullproof",
    description: "Earnings calls locked before the release and graded on the close.",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#0b1218", theme_color: "#0b1218",
    icons: [
      { src: "/icons/bullproof-192.png?v=20261029-bull", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/bullproof-512.png?v=20261029-bull", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/bullproof-maskable-512.png?v=20261029-bull", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
