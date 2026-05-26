import { describe, it, expect } from "vitest";
import { computeNicheDecision } from "./niche-decision";
import type { SaturationReport } from "./saturation";

function makeSaturation(overrides: Partial<SaturationReport> = {}): SaturationReport {
  return {
    totalVideos: 50,
    uniqueChannels: 20,
    medianChannelSubs: 30_000,
    totalChannels: 20,
    medianSubs: 30_000,
    smallChannelCount: 15,
    smallChannelRatio: 0.75,
    smallChannelOutliers: 5,
    smallOutlierRatio: 0.33,
    avgOutlier: 4,
    avgOutlierScore: 4,
    level: "low",
    label: "Low saturation",
    hint: "Underserved niche",
    ...overrides,
  };
}

describe("computeNicheDecision", () => {
  it("returns null for null saturation", () => {
    expect(computeNicheDecision(null)).toBeNull();
  });

  it("returns null when fewer than 5 videos", () => {
    const sat = makeSaturation({ totalVideos: 4 });
    expect(computeNicheDecision(sat)).toBeNull();
  });

  it("returns Enter verdict for very favorable niche", () => {
    const sat = makeSaturation({
      smallOutlierRatio: 0.5,
      level: "low",
      avgOutlier: 8,
      medianChannelSubs: 20_000,
      medianSubs: 20_000,
    });
    const result = computeNicheDecision(sat);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("Enter");
    expect(result!.score).toBeGreaterThanOrEqual(70);
  });

  it("returns Avoid verdict for unfavorable niche", () => {
    const sat = makeSaturation({
      smallOutlierRatio: 0.02,
      level: "high",
      avgOutlier: 1.5,
      medianChannelSubs: 2_000_000,
      medianSubs: 2_000_000,
    });
    const result = computeNicheDecision(sat);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("Avoid");
    expect(result!.score).toBeLessThan(45);
  });

  it("returns at most 3 reasons", () => {
    const sat = makeSaturation();
    const result = computeNicheDecision(sat);
    expect(result!.reasons.length).toBeLessThanOrEqual(3);
  });

  it("score is always between 0 and 100", () => {
    const extreme = makeSaturation({
      smallOutlierRatio: 1.0,
      level: "low",
      avgOutlier: 20,
      medianChannelSubs: 1_000,
      medianSubs: 1_000,
      rpmMax: 15,
    });
    const result = computeNicheDecision(extreme);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
  });

  it("single dominant large channel → Test or Avoid, not Enter", () => {
    const sat = makeSaturation({
      smallOutlierRatio: 0.05,
      level: "high",
      avgOutlier: 2,
      medianChannelSubs: 800_000,
      medianSubs: 800_000,
    });
    const result = computeNicheDecision(sat);
    expect(result!.verdict).not.toBe("Enter");
  });

  it("small channel breakout pattern → Enter or Test", () => {
    const sat = makeSaturation({
      smallOutlierRatio: 0.4,
      level: "medium",
      avgOutlier: 5,
      medianChannelSubs: 25_000,
      medianSubs: 25_000,
    });
    const result = computeNicheDecision(sat);
    expect(["Enter", "Test"]).toContain(result!.verdict);
  });

  it("exactly 5 videos → does not return null", () => {
    const sat = makeSaturation({ totalVideos: 5 });
    expect(computeNicheDecision(sat)).not.toBeNull();
  });

  it("returns Test for mixed-signal niche (score 45-69)", () => {
    // +15 small winner, -20 high saturation, +8 avg outlier = score 53 → Test
    const sat = makeSaturation({
      smallOutlierRatio: 0.2,
      level: "high",
      avgOutlier: 3,
      medianChannelSubs: 100_000,
      medianSubs: 100_000,
    });
    const result = computeNicheDecision(sat);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("Test");
    expect(result!.score).toBeGreaterThanOrEqual(45);
    expect(result!.score).toBeLessThan(70);
  });
});
