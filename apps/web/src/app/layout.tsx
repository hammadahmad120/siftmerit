import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// The one font of the product. Next.js downloads it when the app is built and
// serves it from our own site, so a user's browser never calls Google. The
// font is handed to the styles as the variable `--font-geist-sans`, which
// `globals.css` makes the default font.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Siftmerit",
  description: "Finds the matching CVs in the company mailbox and shows the best five.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} antialiased`}>
      {/* Every page starts with a cream background and navy text. */}
      <body className="bg-brand-cream text-brand-navy">{children}</body>
    </html>
  );
}
