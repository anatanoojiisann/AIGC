import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pai.video / PixVerse Workflow MVP",
  description: "Local prompt, review, provider, HAR, and generation workflow"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
