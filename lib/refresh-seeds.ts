import {
  getChannelVideoSamples,
  getExistingVideoIds,
  disableSeedChannels,
  listSeedChannels,
  logContentRejections,
  markSeedChannelsCrawled,
  recordApiUsage,
  updateChannelContentQuality,
  upsertChannels,
  upsertChannelTags,
  upsertChannelTrends,
  upsertVideos,
  youtubeBatchUnits,
} from "./cache";
import { classifyVideoCategory, estimateRevenue } from "./rpm";
import { fetchChannelRss } from "./rss";
import { computeChannelTrend } from "./trend";
import { estimateMonetized } from "./monetization";
import { getOutlierReason } from "./outlier-reasons";
import { getChannelStats, getVideoStats } from "./youtube";
import type { ChannelStats, VideoStats } from "./youtube";
import type { EnrichedVideo } from "./search-types";
import type { ChannelTrend } from "./trend";
import { matchAlerts, markAlertNotified } from "./alerts";
import { sendAlertEmail } from "./email";
import { classifyVideoContent, type ContentQualityReason } from "./content-quality";
import { parseIsoDurationToSeconds } from "./duration";

export interface RefreshSeedsOptions {
  channelIds?: string[];
  limit?: number;
  usageSource?: string;
}

export interface RefreshSeedsResult {
  seeds: number;
  newVideos: number;
  refreshedChannels: number;
  units: number;
  alertMatches?: number;
  emailsSent?: number;
}

interface RssVideoRef {
  videoId: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  title: string;
}

const thumbnailFor = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

function buildEnrichedVideo(
  ref: RssVideoRef,
  stat: VideoStats,
  channel: ChannelStats,
): EnrichedVideo {
  const channelAvgViews =
    channel.videoCount > 0 ? channel.totalViews / channel.videoCount : Math.max(stat.views, 1);
  const outlierScore = channelAvgViews > 0 ? stat.views / channelAvgViews : 0;
  const categoryMatch = classifyVideoCategory(ref.title, stat.tags ?? []);
  const revenue = estimateRevenue(stat.views, categoryMatch.category);
  const isMonetized =
    channel.isMonetized ??
    estimateMonetized({
      subs: channel.subs,
      videoCount: channel.videoCount,
      createdAt: channel.createdAt,
    });

  const video = {
    id: ref.videoId,
    channelId: ref.channelId,
    channelTitle: ref.channelTitle,
    title: ref.title,
    description: "",
    publishedAt: ref.publishedAt,
    thumbnail: thumbnailFor(ref.videoId),
    tags: stat.tags ?? [],
    views: stat.views,
    likes: stat.likes,
    comments: stat.comments,
    duration: stat.duration,
    durationSeconds: parseIsoDurationToSeconds(stat.duration),
    channelSubs: channel.subs,
    channelAvgViews,
    channelTotalViews: channel.totalViews,
    channelVideoCount: channel.videoCount,
    channelCreatedAt: channel.createdAt,
    channelCountry: channel.country,
    channelThumbnail: channel.thumbnail,
    outlierScore,
    category: revenue.category,
    rpmUsd: revenue.rpmUsd,
    estimatedRevenueUsd: revenue.estimatedRevenueUsd,
    isMonetized,
  };

  return {
    ...video,
    outlierReason: getOutlierReason(video),
  };
}

function channelQualityFromClassifiedVideos(
  videos: EnrichedVideo[],
): Array<{
  channelId: string;
  contentClass: "niche" | "junk";
  reasons: ContentQualityReason[];
  junkVideoRatio: number;
}> {
  const byChannel = new Map<string, { total: number; junk: number; reasons: Map<ContentQualityReason, number> }>();
  for (const video of videos) {
    const current = byChannel.get(video.channelId) ?? { total: 0, junk: 0, reasons: new Map() };
    current.total += 1;
    if (video.contentClass === "junk") {
      current.junk += 1;
      for (const reason of video.contentReasons ?? []) {
        current.reasons.set(reason, (current.reasons.get(reason) ?? 0) + 1);
      }
    }
    byChannel.set(video.channelId, current);
  }
  return [...byChannel.entries()].map(([channelId, stats]) => {
    const junkVideoRatio = stats.total > 0 ? stats.junk / stats.total : 0;
    return {
      channelId,
      contentClass: stats.total >= 2 && junkVideoRatio >= 0.5 ? "junk" : "niche",
      reasons: [...stats.reasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason]) => reason),
      junkVideoRatio,
    };
  });
}

export async function refreshSeedChannels(
  options: RefreshSeedsOptions = {},
): Promise<RefreshSeedsResult> {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY missing");
  }

  const seedChannels =
    options.channelIds && options.channelIds.length > 0
      ? (await listSeedChannels(500)).filter((seed) =>
          options.channelIds?.includes(seed.channelId),
        )
      : await listSeedChannels(options.limit ?? 200);

  if (seedChannels.length === 0) {
    return { seeds: 0, newVideos: 0, refreshedChannels: 0, units: 0 };
  }

  const rssRefs: RssVideoRef[] = [];
  for (const seed of seedChannels) {
    try {
      const entries = await fetchChannelRss(seed.channelId);
      rssRefs.push(
        ...entries.map((entry) => ({
          videoId: entry.videoId,
          channelId: seed.channelId,
          channelTitle: seed.title,
          publishedAt: entry.publishedAt,
          title: entry.title,
        })),
      );
    } catch (error) {
      console.warn("[refresh-seeds] RSS skipped", seed.channelId, error);
    }
  }

  const existingIds = await getExistingVideoIds(rssRefs.map((ref) => ref.videoId));
  const newRefs = rssRefs.filter((ref) => !existingIds.has(ref.videoId));
  const newIds = [...new Set(newRefs.map((ref) => ref.videoId))];
  const seedIds = seedChannels.map((seed) => seed.channelId);

  const [videoStats, freshChannels] = await Promise.all([
    getVideoStats(newIds),
    getChannelStats(seedIds),
  ]);

  const channelsWithMonetization = freshChannels.map((channel) => ({
    ...channel,
    isMonetized: estimateMonetized({
      subs: channel.subs,
      videoCount: channel.videoCount,
      createdAt: channel.createdAt,
    }),
  }));

  await upsertChannels(channelsWithMonetization);

  const statsMap = new Map(videoStats.map((stat) => [stat.id, stat]));
  const channelMap = new Map(channelsWithMonetization.map((channel) => [channel.id, channel]));

  const videos = newRefs.flatMap((ref): EnrichedVideo[] => {
    const stat = statsMap.get(ref.videoId);
    const channel = channelMap.get(ref.channelId);
    if (!stat || !channel) return [];
    return [buildEnrichedVideo(ref, stat, channel)];
  });

  const classifiedVideos = videos.map((video) => {
    const durationSeconds = video.durationSeconds ?? parseIsoDurationToSeconds(video.duration);
    const classification = classifyVideoContent({ ...video, durationSeconds });
    return {
      ...video,
      durationSeconds,
      contentClass: classification.contentClass,
      contentReasons: classification.reasons,
      contentScore: classification.score,
    };
  });
  const nicheVideos = classifiedVideos.filter((video) => video.contentClass === "niche");
  const junkVideos = classifiedVideos.filter((video) => video.contentClass === "junk");

  if (junkVideos.length > 0) await logContentRejections(junkVideos, "refreshSeedChannels");
  await upsertVideos(nicheVideos);

  const channelQuality = channelQualityFromClassifiedVideos(classifiedVideos);
  await updateChannelContentQuality(channelQuality);
  const junkChannelIds = channelQuality
    .filter((entry) => entry.contentClass === "junk")
    .map((entry) => entry.channelId);
  if (junkChannelIds.length > 0) {
    await disableSeedChannels(junkChannelIds, "content_quality_junk_ratio");
  }

  const tagCountsByChannel = new Map<string, Map<string, number>>();
  for (const video of nicheVideos) {
    for (const tag of video.tags ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) continue;
      const counts = tagCountsByChannel.get(video.channelId) ?? new Map<string, number>();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      tagCountsByChannel.set(video.channelId, counts);
    }
  }

  await Promise.all(
    [...tagCountsByChannel.entries()].map(([channelId, counts]) =>
      upsertChannelTags(
        channelId,
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag]) => tag),
      ),
    ),
  );

  const samples = await getChannelVideoSamples(seedIds, 90);
  const trends: Array<{ channelId: string; trend: ChannelTrend }> = [];
  for (const channelId of seedIds) {
    const trend = computeChannelTrend(samples.get(channelId) ?? []);
    if (trend) trends.push({ channelId, trend });
  }
  await upsertChannelTrends(trends);
  await markSeedChannelsCrawled(seedIds);

  const alertMatches = await matchAlerts(nicheVideos);
  let emailsSent = 0;
  for (const match of alertMatches) {
    if (await sendAlertEmail(match.alert.email, match.matches)) {
      emailsSent += 1;
      await markAlertNotified(match.alert.id);
    }
  }

  const units = youtubeBatchUnits(newIds.length) + youtubeBatchUnits(seedIds.length);
  await recordApiUsage(
    units,
    {
      job: "refresh-seeds",
      seeds: seedChannels.length,
      newVideos: nicheVideos.length,
      rejectedVideos: junkVideos.length,
      alertMatches: alertMatches.reduce((sum, match) => sum + match.matches.length, 0),
      emailsSent,
    },
    options.usageSource ?? "cron",
  );

  return {
    seeds: seedChannels.length,
    newVideos: nicheVideos.length,
    refreshedChannels: channelsWithMonetization.length,
    units,
    alertMatches: alertMatches.reduce((sum, match) => sum + match.matches.length, 0),
    emailsSent,
  };
}
