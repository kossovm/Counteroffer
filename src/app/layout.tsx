import type { Metadata } from "next";
import "./globals.css";

// Fonts are self-hosted later via next/font/local so builds never depend on an external font CDN.

export const metadata: Metadata = {
  title: "Counter — rehearse the conversations that cost you money",
  description:
    "Practice the raise, the offer and the rent talk against an AI counterpart who does not fold, and see exactly how much you left on the table.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
