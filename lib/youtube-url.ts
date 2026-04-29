export function parseChannelIdFromUrl(url: string): string | null {
  const trimmed = url.trim();

  if (trimmed.startsWith("UC") && trimmed.length === 24 && /^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com" || parsed.hostname === "m.youtube.com") {
      if (parsed.pathname.startsWith("/channel/")) {
        const match = parsed.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
        return match ? match[1] : null;
      }

      if (parsed.pathname.startsWith("/@")) {
        const handle = parsed.pathname.slice(2);
        if (handle) {
          return `@${handle}`;
        }
      }

      if (parsed.pathname.startsWith("/c/")) {
        const customName = parsed.pathname.slice(3);
        if (customName) {
          return customName;
        }
      }

      if (parsed.pathname.startsWith("/user/")) {
        const userName = parsed.pathname.slice(6);
        if (userName) {
          return userName;
        }
      }

      if (parsed.pathname.startsWith("/watch")) {
        const videoId = parsed.searchParams.get("v");
        if (videoId) {
          return `video:${videoId}`;
        }
      }
    }

    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      if (videoId) {
        return `video:${videoId}`;
      }
    }
  } catch {
    return null;
  }

  const channelMatch = trimmed.match(/UC[a-zA-Z0-9_-]{22}/);
  return channelMatch ? channelMatch[0] : null;
}