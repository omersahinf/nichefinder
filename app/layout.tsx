import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NicheFinder — YouTube niche discovery",
  description: "MVP interface for YouTube niche discovery and outlier analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-neutral-950 font-sans text-neutral-100">
        {children}
      </body>
    </html>
  );
}
