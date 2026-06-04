import type { MetadataRoute } from "next";

/** PWA manifest — makes Forkful installable to the iPhone home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Forkful — recipe swiping",
    short_name: "Forkful",
    description: "Swipe to find what to cook. Right to save, tap to cook.",
    start_url: "/",
    display: "standalone", // full-screen, no browser chrome
    background_color: "#0f1115",
    theme_color: "#0f1115",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
