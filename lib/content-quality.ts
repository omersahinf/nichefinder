import type { EnrichedVideo } from "./search-types";
import { hasShortsSignal } from "./video-format";

export type ContentClass = "niche" | "junk";

export type ContentQualityReason =
  | "short_clip"
  | "trailer_promo"
  | "announcement"
  | "film_tv_show"
  | "sports_match"
  | "gaming_gameplay"
  | "live_stream"
  | "broadcast_clip"
  | "official_music_video"
  | "creator_niche_signal";

export interface ContentQualityResult {
  contentClass: ContentClass;
  reasons: ContentQualityReason[];
  score: number;
}

export type ContentQualityInput = Pick<
  EnrichedVideo,
  "title" | "description" | "tags" | "durationSeconds" | "duration"
>;

const HARD_BLOCKERS: Array<{
  reason: Exclude<ContentQualityReason, "short_clip" | "creator_niche_signal">;
  regex: RegExp;
}> = [
  {
    reason: "trailer_promo",
    regex:
      /\b(official\s+trailer|final\s+trailer|teaser\s+trailer|trailer|tráiler|teaser|promo|coming\s+soon|release\s+date|first\s+look|crowd\s+reaction)\b/i,
  },
  {
    reason: "announcement",
    regex:
      /\b(announcement|announced|officially\s+announced|revealed|launch\s+event|premiere\s+date|release\s+announcement)\b/i,
  },
  {
    reason: "film_tv_show",
    regex:
      /\b(movie|movie\s+clip|film\s+clip|official\s+clip|movie\s+review|spoiler\s+alert|movie\s+theater|scary\s+movie|wayans|backrooms|tv\s+show|full\s+episode|episode\s+\d+|ep\s+\d+|season\s+\d+|web\s+series|netflix|disney\+|hbo|max\s+original|prime\s+video|celebrity|superstars|maribel\s+guardia|kevin\s+hart|jared\s+leto|yanina|cdrama|kdrama|c-drama|k-drama|multi\s+sub|multisub|eng\s+sub|transmigrated|reborn\s+with|plot\s+and\s+built|短剧|漫剧|动漫|新番|全集)\b/i,
  },
  {
    reason: "sports_match",
    regex:
      /\b(highlights|match\s+highlights|game\s+highlights|full\s+match|test\s+match|2nd\s+test|test\s+day|final\s+day|scores?\s+and|live\s+commentary|pakistan\s+vs\s+bangladesh|pak\s+vs\s+ban|rizwan|international\s+friendly|live\s+score|goals?|ncaa|100m\s+final|big\s+ten|all-conditions|runnerspace|football|soccer|basketball|baseball|nba|nfl|mlb|nhl|ufc|fifa|mlb|leafs\s+head\s+coach|elliotte\s+friedman|first\s+take|knicks|cruz\s+azul|pumas|tim\s+payne|juan\s+soto|world\s+cup|mundial|jornada|tabla\s+de\s+posiciones|concacaf|belmont\s+stakes|horse\s+racing|full-field\s+analysis|premier\s+league|champions\s+league|wwe|cricket|ipl|tartan\s+army|scotland\s+fans)\b/i,
  },
  {
    reason: "gaming_gameplay",
    regex:
      /\b(gameplay|walkthrough|let'?s\s+play|speedrun|combat\s+system|admin\s+abuse|minecraft|fortnite|roblox|gta\s*v?|valorant|call\s+of\s+duty|warzone|free\s+fire|pubg|gaming\s+setup|game\s+stream|nintendo\s+direct|state\s+of\s+play|xbox\s+game|xbox\s+games|games\s+showcase|game\s+showcase|indie\s+games|summer\s+game\s+fest|resident\s+evil|final\s+fantasy|gothic\s+1\s+remake|persona\s+6|sonic|halo|spyro)\b/i,
  },
  {
    reason: "live_stream",
    regex:
      /(^|\b)(live|live\s+stream|livestream|stream\s+highlights|streamed\s+live|full\s+stream|watch\s+live|live\s+now|live:|ao\s+vivo|en\s+vivo|en\s+directo|watch\s+party|concert)\b/i,
  },
  {
    reason: "broadcast_clip",
    regex:
      /\b(news|news\s+clip|tv\s+broadcast|broadcast\s+clip|late\s+show|tonight\s+show|interview\s+clip|weather\s+update|weekend\s+update|campaign|commencement\s+speech|ukraine|russia|convoy|kill\s+zone|drone\s+kill|arrested|interrogation|desaparición|agostina|police|police\s+report|house\s+passes|iran\s+war|fbi|rico\s+suits|restraining\s+orders|anti-trump|trump|donald|prosecutor|organized\s+crime|first\s+alert|cnn|fox\s+news|bbc\s+news|sky\s+news|msnbc|wbtv)\b/i,
  },
  {
    reason: "official_music_video",
    regex:
      /\b(official\s+video|official\s+music\s+video|music\s+video|lyric\s+video|visualizer|audio\s+official|official\s+audio|audio\s+full|full\s+audio|full\s+album|campaign\s+song|worship\s+music|songs\s+playlist|top\s+christian\s+songs|tiktok\s+mashup)\b/i,
  },
];

const NICHE_SIGNAL_REGEX =
  /\b(explained|documentary|case\s+study|how\s+to|guide|for\s+beginners|beginner'?s\s+guide|tutorial|breakdown|analysis|deep\s+dive|mistakes|lessons|strategy|framework|workflow|finance|business|startup|saas|tech|ai|education|health|productivity|history|science|engineering|investing|marketing|automation)\b/i;

export function classifyVideoContent(video: ContentQualityInput): ContentQualityResult {
  const text = `${video.title} ${video.description} ${(video.tags ?? []).join(" ")}`;
  const reasons = new Set<ContentQualityReason>();

  if (
    (typeof video.durationSeconds === "number" && video.durationSeconds > 0 && video.durationSeconds <= 180) ||
    hasShortsSignal(video) ||
    /\b(pov\s+short|shorts?)\b/i.test(text)
  ) {
    reasons.add("short_clip");
  }

  for (const blocker of HARD_BLOCKERS) {
    if (blocker.regex.test(text)) reasons.add(blocker.reason);
  }

  const hardReasons = [...reasons];
  if (hardReasons.length > 0) {
    return {
      contentClass: "junk",
      reasons: hardReasons,
      score: Math.max(0.02, 0.22 - hardReasons.length * 0.03),
    };
  }

  if (NICHE_SIGNAL_REGEX.test(text)) {
    return {
      contentClass: "niche",
      reasons: ["creator_niche_signal"],
      score: 0.9,
    };
  }

  return {
    contentClass: "niche",
    reasons: [],
    score: 0.62,
  };
}

export function isNicheContentClass(value: string | null | undefined): boolean {
  return value === "niche";
}
