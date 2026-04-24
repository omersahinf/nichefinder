export type VideoCategory =
  | "finance"
  | "business"
  | "tech"
  | "education"
  | "health"
  | "gaming"
  | "entertainment"
  | "lifestyle"
  | "music"
  | "other";

export interface VideoCategoryMatch {
  category: VideoCategory;
  confidence: number;
}

export interface RevenueEstimate {
  category: VideoCategory;
  rpmUsd: number;
  estimatedRevenueUsd: number;
}

const RPM_BY_CATEGORY: Record<VideoCategory, number> = {
  finance: 12,
  business: 10,
  tech: 6,
  education: 5,
  health: 6,
  lifestyle: 4,
  entertainment: 3,
  gaming: 2,
  music: 1.5,
  other: 3,
};

// Keyword matchers are ordered by specificity; more specific niches first.
const CATEGORY_KEYWORDS: Array<[VideoCategory, readonly string[]]> = [
  [
    "finance",
    [
      "money",
      "invest",
      "stock",
      "crypto",
      "bitcoin",
      "ethereum",
      "trading",
      "fintech",
      "budget",
      "passive income",
      "dividend",
      "tax",
      "kazan",
      "yatırım",
      "hisse",
      "borsa",
      "kripto",
    ],
  ],
  [
    "business",
    [
      "business",
      "startup",
      "entrepreneur",
      "marketing",
      "sales",
      "seo",
      "ecommerce",
      "saas",
      "freelance",
      "girişim",
      "pazarlama",
      "satış",
    ],
  ],
  [
    "tech",
    [
      "tech",
      "software",
      "programming",
      "coding",
      "developer",
      "javascript",
      "python",
      "react",
      "ai",
      "machine learning",
      "llm",
      "chatgpt",
      "yapay zeka",
      "yazılım",
      "kod",
    ],
  ],
  [
    "education",
    [
      "learn",
      "tutorial",
      "course",
      "lesson",
      "explain",
      "how to",
      "öğren",
      "ders",
      "eğitim",
      "nasıl",
    ],
  ],
  [
    "health",
    [
      "health",
      "fitness",
      "workout",
      "diet",
      "nutrition",
      "yoga",
      "meditation",
      "mental",
      "sağlık",
      "spor",
      "beslenme",
    ],
  ],
  [
    "gaming",
    [
      "game",
      "gaming",
      "gameplay",
      "minecraft",
      "fortnite",
      "valorant",
      "league of legends",
      "esport",
      "oyun",
    ],
  ],
  [
    "music",
    ["music", "song", "remix", "beat", "cover", "lyrics", "müzik", "şarkı", "klip"],
  ],
  [
    "lifestyle",
    [
      "vlog",
      "lifestyle",
      "travel",
      "fashion",
      "beauty",
      "food",
      "recipe",
      "gezi",
      "yemek",
      "tarif",
    ],
  ],
  [
    "entertainment",
    [
      "funny",
      "prank",
      "reaction",
      "comedy",
      "movie",
      "film",
      "eğlence",
      "komedi",
      "reaksiyon",
    ],
  ],
];

const normalize = (input: string): string => input.toLowerCase();

export function classifyVideoCategory(
  title: string,
  tags: readonly string[] = [],
  description = "",
): VideoCategoryMatch {
  const haystack = normalize(`${title} ${tags.join(" ")} ${description}`);

  let best: VideoCategoryMatch = { category: "other", confidence: 0 };

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    let hits = 0;
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) hits += 1;
    }
    if (hits > best.confidence) {
      best = { category, confidence: hits };
    }
  }

  return best;
}

export function rpmFor(category: VideoCategory): number {
  return RPM_BY_CATEGORY[category] ?? RPM_BY_CATEGORY.other;
}

export function estimateRevenue(views: number, category: VideoCategory): RevenueEstimate {
  const rpm = rpmFor(category);
  return {
    category,
    rpmUsd: rpm,
    estimatedRevenueUsd: Math.round((views / 1000) * rpm),
  };
}
