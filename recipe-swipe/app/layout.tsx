import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forkful — swipe to find what to cook",
  description:
    "Tinder-style recipe discovery across multiple recipe sources. Swipe right to save, tap to cook on the original site.",
  applicationName: "Forkful",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true, // full-screen when launched from the home screen
    title: "Forkful",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Older iOS reads the Apple-prefixed tag for full-screen standalone launch.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // stop iOS zoom-on-tap so it feels like an app
  userScalable: false,
  viewportFit: "cover", // draw under the notch; CSS uses safe-area insets
  themeColor: "#0f1115",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
