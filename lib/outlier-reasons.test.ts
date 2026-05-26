import { describe, it, expect } from "vitest";
import { buildOutlierExplanation, getOutlierReason } from "./outlier-reasons";

const base = {
  views: 100_000,
  channelSubs: 50_000,
  channelAvgViews: 10_000,
  outlierScore: 10,
  publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  isShort: false,
  category: "finance",
  rpmUsd: 9,
};

describe("buildOutlierExplanation", () => {
  it("returns a non-empty summary", () => {
    const { summary } = buildOutlierExplanation(base);
    expect(summary.length).toBeGreaterThan(0);
  });

  it("returns factors array", () => {
    const { factors } = buildOutlierExplanation(base);
    expect(Array.isArray(factors)).toBe(true);
  });

  it("identifies tiny channel viral spike", () => {
    const video = { ...base, channelSubs: 5_000, outlierScore: 15 };
    const { summary } = buildOutlierExplanation(video);
    expect(summary).toMatch(/tiny|viral/i);
  });

  it("identifies hot trend for very recent high performer", () => {
    const video = {
      ...base,
      publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      channelAvgViews: 10_000,
      views: 80_000,
      outlierScore: 8,
    };
    const { factors } = buildOutlierExplanation(video);
    const labels = factors.map((f) => f.label);
    expect(labels).toContain("upload age");
  });

  it("includes RPM factor for high-RPM categories", () => {
    const { factors } = buildOutlierExplanation(base);
    const rpmFactor = factors.find((f) => f.label === "category RPM");
    expect(rpmFactor).toBeDefined();
  });

  it("marks shorts format", () => {
    const video = { ...base, isShort: true };
    const { factors } = buildOutlierExplanation(video);
    expect(factors.some((f) => f.label === "format")).toBe(true);
  });

  it("all signal values are valid", () => {
    const { factors } = buildOutlierExplanation(base);
    for (const f of factors) {
      expect(["positive", "neutral", "note"]).toContain(f.signal);
    }
  });
});

describe("getOutlierReason", () => {
  it("returns a string", () => {
    expect(typeof getOutlierReason(base)).toBe("string");
  });
});
