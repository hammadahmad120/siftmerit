import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siftmerit",
  description: "Finds the matching CVs in the company mailbox and shows the best five.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
