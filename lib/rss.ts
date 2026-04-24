export interface ChannelRssVideo {
  videoId: string;
  publishedAt: string;
  title: string;
}

const decodeXml = (value: string): string =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");

const tagValue = (entry: string, tag: string): string => {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : "";
};

export async function fetchChannelRss(channelId: string): Promise<ChannelRssVideo[]> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { next: { revalidate: 900 } },
  );

  if (!res.ok) {
    throw new Error(`YouTube RSS failed for ${channelId}: ${res.status}`);
  }

  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  return entries.flatMap((entry) => {
    const videoId = tagValue(entry, "yt:videoId");
    const publishedAt = tagValue(entry, "published");
    const title = tagValue(entry, "title");
    if (!videoId || !publishedAt || !title) return [];
    return [{ videoId, publishedAt, title }];
  });
}
