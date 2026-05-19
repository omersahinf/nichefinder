import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { siteName, siteUrl } from "@/lib/site";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${siteName} | YouTube niche discovery`,
    template: `%s | ${siteName}`,
  },
  description:
    "Find YouTube niches with outlier analysis, saturation signals, similar channels, and revenue context.",
  openGraph: {
    title: `${siteName} | YouTube niche discovery`,
    description:
      "Find YouTube niches with outlier analysis, saturation signals, similar channels, and revenue context.",
    url: siteUrl(),
    siteName,
    images: [{ url: "/opengraph-image" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | YouTube niche discovery`,
    description:
      "Find YouTube niches with outlier analysis, saturation signals, similar channels, and revenue context.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <body className="flex min-h-full flex-col bg-neutral-950 font-sans text-neutral-100">
        {children}
      </body>
    </html>
  );
}
