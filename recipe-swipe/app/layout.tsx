import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forkful — swipe to find what to cook",
  description:
    "Tinder-style recipe discovery across multiple recipe sources. Swipe right to save, tap to cook on the original site.",
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
