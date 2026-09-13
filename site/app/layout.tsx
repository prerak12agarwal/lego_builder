import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "LEGO Builder — Your brick workshop",
    description: "Explore your brick workshop: plan a project, inspect a sample model, and follow its parts and assembly steps.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en">
      <body className="antialiased">{children}</body>
    </html>);
}
