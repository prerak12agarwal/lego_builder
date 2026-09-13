import type { Metadata } from "next";
import "./globals.css";
import "./reconstruction.css";
export const metadata: Metadata = {
    title: "LEGO Builder — Your brick workshop",
    description: "Turn an object photo into a 3D mesh, convert it to LEGO, and inspect the brick model, parts and authored steps.",
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
