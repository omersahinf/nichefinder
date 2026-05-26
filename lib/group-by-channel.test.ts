import { describe, it, expect } from "vitest";
import { groupVideosByChannel } from "./group-by-channel";
import type { EnrichedVideo } from "./search-types";

function makeVideo(overrides: Partial<EnrichedVideo> = {}): EnrichedVideo {
  return {
    id: "vid_" + Math.random().toString(36).slice(2),
    channelId: "ch_a",
    channelTitle: "Channel A",
    title: "Video Title",
    description: "",
    publishedAt: new Date().toISOString(),
    thumbnail: "",
    views: 50_000,
    likes: 500,
    comments: 50,
    duration: "PT8M",
    channelSubs: 10_000,
    channelAvgViews: 5_000,
    outlierScore: 3,
    outlierReason: "",
    ...overrides,
  };
}

describe("groupVideosByChannel", () => {
  it("returns empty array for empty input", () => {
    expect(groupVideosByChannel([])).toEqual([]);
  });

  it("groups videos by channelId", () => {
    const videos = [
      makeVideo({ channelId: "ch_a", id: "v1" }),
      makeVideo({ channelId: "ch_a", id: "v2" }),
      makeVideo({ channelId: "ch_b", id: "v3" }),
    ];
    const groups = groupVideosByChannel(videos);
    expect(groups).toHaveLength(2);
    const chA = groups.find((g) => g.channelId === "ch_a");
    expect(chA?.totalVideosInNiche).toBe(2);
  });

  it("limits topVideos to topN", () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({ id: `v${i}`, outlierScore: i + 1 }),
    );
    const groups = groupVideosByChannel(videos, 3);
    expect(groups[0].topVideos).toHaveLength(3);
  });

  it("sorts topVideos by outlierScore descending", () => {
    const videos = [
      makeVideo({ id: "v1", outlierScore: 2 }),
      makeVideo({ id: "v2", outlierScore: 10 }),
      makeVideo({ id: "v3", outlierScore: 5 }),
    ];
    const groups = groupVideosByChannel(videos, 3);
    const scores = groups[0].topVideos.map((v) => v.outlierScore);
    expect(scores).toEqual([10, 5, 2]);
  });

  it("sorts groups by bestOutlierScore descending", () => {
    const videos = [
      makeVideo({ channelId: "ch_low", outlierScore: 2 }),
      makeVideo({ channelId: "ch_high", outlierScore: 15 }),
    ];
    const groups = groupVideosByChannel(videos);
    expect(groups[0].channelId).toBe("ch_high");
  });

  it("computes avgOutlierScore correctly", () => {
    const videos = [
      makeVideo({ id: "v1", outlierScore: 4 }),
      makeVideo({ id: "v2", outlierScore: 8 }),
    ];
    const groups = groupVideosByChannel(videos);
    expect(groups[0].avgOutlierScore).toBe(6);
  });
});
