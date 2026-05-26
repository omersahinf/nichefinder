import { describe, it, expect } from "vitest";
import { computeSaturation } from "./saturation";
import type { EnrichedVideo } from "./search-types";

function makeVideo(overrides: Partial<EnrichedVideo> = {}): EnrichedVideo {
  return {
    id: "vid_" + Math.random().toString(36).slice(2),
    channelId: "ch_default",
    channelTitle: "Test Channel",
    title: "Test Video",
    description: "",
    publishedAt: new Date().toISOString(),
    thumbnail: "",
    views: 100_000,
    likes: 1000,
    comments: 100,
    duration: "PT10M",
    channelSubs: 50_000,
    channelAvgViews: 20_000,
    outlierScore: 3,
    outlierReason: "3x channel avg",
    ...overrides,
  };
}

describe("computeSaturation", () => {
  it("returns null for empty videos", () => {
    expect(computeSaturation([])).toBeNull();
  });

  it("returns low saturation for small channels with high outliers", () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({
        channelId: `ch_${i}`,
        channelSubs: 5_000,
        outlierScore: 6,
      }),
    );
    const result = computeSaturation(videos);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("low");
  });

  it("returns high saturation when median subs is very high", () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({
        channelId: `ch_${i}`,
        channelSubs: 2_000_000,
        outlierScore: 1,
      }),
    );
    const result = computeSaturation(videos);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("high");
  });

  it("counts unique channels correctly", () => {
    const videos = [
      makeVideo({ channelId: "ch_1", channelSubs: 10_000 }),
      makeVideo({ channelId: "ch_1", channelSubs: 10_000 }),
      makeVideo({ channelId: "ch_2", channelSubs: 20_000 }),
    ];
    const result = computeSaturation(videos);
    expect(result!.uniqueChannels).toBe(2);
    expect(result!.totalVideos).toBe(3);
  });

  it("computes opportunityScore between 0 and 100", () => {
    const videos = Array.from({ length: 5 }, (_, i) =>
      makeVideo({ channelId: `ch_${i}`, channelSubs: 8_000, outlierScore: 5 }),
    );
    const result = computeSaturation(videos);
    expect(result!.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result!.opportunityScore).toBeLessThanOrEqual(100);
  });
});
