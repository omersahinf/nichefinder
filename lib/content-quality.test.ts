import { describe, expect, it } from "vitest";
import { classifyVideoContent } from "./content-quality";

const baseVideo = {
  title: "How AI Agents Actually Work",
  description: "",
  tags: [] as string[],
  duration: "PT10M",
  durationSeconds: 600,
};

describe("classifyVideoContent", () => {
  it("quarantines shorts and short clips", () => {
    expect(
      classifyVideoContent({
        ...baseVideo,
        title: "5 finance habits #shorts",
        durationSeconds: 45,
      }).contentClass,
    ).toBe("junk");

    expect(
      classifyVideoContent({
        ...baseVideo,
        title: "Quick crypto tip",
        durationSeconds: 180,
      }).reasons,
    ).toContain("short_clip");
  });

  it("quarantines trailers, announcements, show clips, sports, gaming, live streams, broadcasts, and music videos", () => {
    const cases = [
      ["Official Trailer - New Movie", "trailer_promo"],
      ["Big Product Announcement Revealed", "announcement"],
      ["Netflix Series Official Clip", "film_tv_show"],
      ["Arsenal vs Chelsea Match Highlights", "sports_match"],
      ["Football Strategy Analysis", "sports_match"],
      ["Minecraft Survival Gameplay Part 1", "gaming_gameplay"],
      ["Live Stream Highlights From Today", "live_stream"],
      ["CNN News Clip Interview Segment", "broadcast_clip"],
      ["Artist Name - Song Title Official Music Video", "official_music_video"],
      ["News On 6 Overnight Weather Update", "broadcast_clip"],
      ["RESULTADOS y TABLA DE POSICIONES de la JORNADA 1 del MUNDIAL 2026", "sports_match"],
      ["Out Of Focus Live", "live_stream"],
      ["Killed by my own family, reborn with four stunning beauties to take brutal revenge. #cdrama", "film_tv_show"],
      ["Pakistan vs Bangladesh 2nd TEST Day 5, Final Day, Scores and Live Commentary", "sports_match"],
      ["Pak vs Ban: 90% Bangladesh Won Test Match, Rizwan vs Bangladesh on Day 4", "sports_match"],
      ["Los recuerdos de Jade son... | Ep 5: análisis, explicación y teorías | FROM", "film_tv_show"],
      ["Men's 100m Final [NCAA #2 All-Conditions All-Time] - Big Ten Outdoor", "sports_match"],
      ["The Wayans Brothers Are BACK W/New SCARY MOVIE!", "film_tv_show"],
    ] as const;

    for (const [title, reason] of cases) {
      const result = classifyVideoContent({ ...baseVideo, title });
      expect(result.contentClass, title).toBe("junk");
      expect(result.reasons, title).toContain(reason);
    }
  });

  it("keeps strict creator niche long-form examples", () => {
    const cases = [
      "Faceless Finance Case Study: How Small Channels Make Money",
      "AI Automation Workflow Explained For Beginners",
      "The History Documentary Format That Still Works",
      "How To Build A Productivity System In Notion",
      "SaaS Marketing Breakdown: 7 Lessons From Failed Startups",
    ];

    for (const title of cases) {
      const result = classifyVideoContent({ ...baseVideo, title });
      expect(result.contentClass, title).toBe("niche");
      expect(result.score, title).toBeGreaterThan(0.6);
    }
  });

  it("does not treat normal comparison videos as sports matches", () => {
    const result = classifyVideoContent({
      ...baseVideo,
      title: "iPhone vs Android Privacy Explained",
    });
    expect(result.contentClass).toBe("niche");
    expect(result.reasons).not.toContain("sports_match");
  });
});
