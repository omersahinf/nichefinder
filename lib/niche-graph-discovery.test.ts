import { describe, expect, it } from "vitest";
import {
  hasJunkKeywordSignal,
  normalizeNicheKeyword,
  scoreNicheCandidate,
  type NicheGraphExample,
} from "./niche-graph-discovery";

function example(overrides: Partial<NicheGraphExample> = {}): NicheGraphExample {
  return {
    videoId: "v_" + Math.random().toString(36).slice(2),
    channelId: "ch_a",
    channelTitle: "Creator Channel",
    channelSubs: 42_000,
    title: "How Ancient Engineering Actually Works",
    views: 120_000,
    outlierScore: 5,
    publishedAt: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    category: "education",
    pattern: "how {topic} works",
    ...overrides,
  };
}

describe("niche graph discovery helpers", () => {
  it("normalizes candidate keywords", () => {
    expect(normalizeNicheKeyword("  Ancient Engineering!!! 2026 ")).toBe("ancient engineering");
  });

  it("blocks sports, live, movie, game, trailer, and shorts keywords", () => {
    const cases = [
      "nba match highlights",
      "watch live cricket",
      "new movie trailer",
      "minecraft gameplay",
      "netflix full episode",
      "finance shorts",
      "football strategy",
      "dodgers vs",
      "dodgers vs padres",
      "bangladesh vs zealand",
      "uefa champions",
      "psg vs",
    ];

    for (const keyword of cases) {
      expect(hasJunkKeywordSignal(keyword), keyword).toBe(true);
    }
  });

  it("scores repeated small-channel outliers as a strong candidate", () => {
    const result = scoreNicheCandidate({
      keyword: "ancient engineering",
      occurrences: 4,
      channelCount: 3,
      examples: [
        example({ channelId: "ch_a", outlierScore: 6, channelSubs: 20_000 }),
        example({ channelId: "ch_b", outlierScore: 5, channelSubs: 75_000 }),
        example({ channelId: "ch_c", outlierScore: 4.5, channelSubs: 140_000 }),
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain("small_channel_outliers");
    expect(result.reasons).toContain("multi_channel_repeatable");
  });

  it("penalizes clean-looking terms when they are single-channel dependent", () => {
    const result = scoreNicheCandidate({
      keyword: "business breakdown",
      occurrences: 3,
      channelCount: 1,
      examples: [
        example({ channelId: "ch_a", category: "business", outlierScore: 8 }),
        example({ channelId: "ch_a", category: "business", outlierScore: 7 }),
      ],
    });

    expect(result.score).toBeLessThan(70);
    expect(result.penalties).toContain("single_channel_dependency");
  });

  it("keeps evergreen clean examples above junk candidates", () => {
    const clean = scoreNicheCandidate({
      keyword: "finance case study",
      occurrences: 4,
      channelCount: 3,
      examples: [
        example({ channelId: "ch_a", category: "finance", title: "Startup Finance Case Study", outlierScore: 5 }),
        example({ channelId: "ch_b", category: "business", title: "Small Business Breakdown", outlierScore: 4 }),
        example({ channelId: "ch_c", category: "finance", title: "Personal Finance Explained", outlierScore: 4.5 }),
      ],
    });
    const junk = scoreNicheCandidate({
      keyword: "movie trailer",
      occurrences: 5,
      channelCount: 3,
      examples: [
        example({ channelId: "ch_a", title: "Official Movie Trailer", outlierScore: 9 }),
        example({ channelId: "ch_b", title: "New Movie Trailer", outlierScore: 9 }),
        example({ channelId: "ch_c", title: "Final Trailer", outlierScore: 9 }),
      ],
    });

    expect(clean.score).toBeGreaterThanOrEqual(70);
    expect(junk.score).toBeLessThan(50);
    expect(junk.penalties).toContain("junk_keyword_signal");
  });
});
