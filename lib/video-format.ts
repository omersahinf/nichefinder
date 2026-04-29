import type { EnrichedVideo } from "./search-types";

export type VideoFormatFilter = "all" | "standard" | "shorts";

export function hasShortsSignal(video: Pick<EnrichedVideo, "title" | "description" | "tags">): boolean {
  const text = `${video.title} ${video.description}`.toLowerCase();
  const tags = (video.tags ?? []).map((tag) => tag.trim().toLowerCase());

  return (
    /(^|\s)#(shorts|youtubeshorts)(\s|$)/.test(text) ||
    tags.some((tag) => tag === "shorts" || tag === "youtube shorts" || tag === "youtubeshorts")
  );
}

export function matchesVideoFormat(video: EnrichedVideo, format: VideoFormatFilter = "all"): boolean {
  if (format === "all") return true;

  const isShort = video.isShort ?? hasShortsSignal(video);
  return format === "shorts" ? isShort : !isShort;
}
