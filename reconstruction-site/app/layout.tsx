import type { Metadata } from "next";
import "./globals.css";
import "./workbench.css";
import "./pipeline.css";

export const metadata: Metadata = {
  title: "LEGO Builder — Build Workspace",
  description: "Reconstruct a photo, save its converter handoff, and inspect returned LEGO models, parts and assembly steps.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
