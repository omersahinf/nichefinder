import { UrlReportClient } from "./UrlReportClient";

export const metadata = {
  title: "Video URL Report — NicheFinder",
  description: "Paste a YouTube video URL to analyze its niche, outlier score, and competition.",
};

export default function UrlReportPage() {
  return <UrlReportClient />;
}
