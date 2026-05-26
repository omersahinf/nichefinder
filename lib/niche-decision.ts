import type { SaturationReport } from "./saturation";

export type NicheVerdict = "Enter" | "Test" | "Avoid";

export interface NicheDecision {
  score: number;
  verdict: NicheVerdict;
  reasons: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function computeNicheDecision(
  saturation: SaturationReport | null,
): NicheDecision | null {
  if (!saturation || saturation.totalVideos < 5) return null;

  const reasons: string[] = [];
  let score = 50;

  // Small channel outlier ratio (0–30 points)
  const smallWinnerRatio = saturation.smallOutlierRatio ?? 0;
  if (smallWinnerRatio >= 0.35) {
    score += 30;
    reasons.push(`${Math.round(smallWinnerRatio * 100)}% of small channels have breakout videos`);
  } else if (smallWinnerRatio >= 0.15) {
    score += 15;
    reasons.push(`${Math.round(smallWinnerRatio * 100)}% small-channel winner rate (moderate)`);
  } else if (smallWinnerRatio < 0.05) {
    score -= 20;
    reasons.push("Very few small channels break out here");
  }

  // Saturation level (−20 to +10 points)
  if (saturation.level === "low") {
    score += 10;
    reasons.push("Low saturation — room to enter");
  } else if (saturation.level === "high") {
    score -= 20;
    reasons.push("High saturation — dominated by large channels");
  }

  // Average outlier score (0–20 points)
  const avgOutlier = saturation.avgOutlier ?? saturation.avgOutlierScore ?? 0;
  if (avgOutlier >= 6) {
    score += 20;
    reasons.push(`High average outlier score (${avgOutlier.toFixed(1)}×) — niche rewards quality`);
  } else if (avgOutlier >= 3) {
    score += 8;
    reasons.push(`Average outlier score ${avgOutlier.toFixed(1)}× — some breakout potential`);
  }

  // Median subs (channel size check)
  const medSubs = saturation.medianChannelSubs ?? saturation.medianSubs ?? 0;
  if (medSubs > 500_000) {
    score -= 15;
    reasons.push("Median channel has 500K+ subs — established competition");
  } else if (medSubs < 50_000) {
    score += 10;
    reasons.push("Median channel under 50K — early adopter opportunity");
  }

  // RPM context (+/- 5)
  const rpmMax = saturation.rpmMax;
  if (rpmMax !== undefined && rpmMax >= 8) {
    score += 5;
    reasons.push(`High RPM potential (~$${rpmMax}/1K views)`);
  }

  score = clamp(score, 0, 100);

  // Trim to top 3 most impactful reasons
  const topReasons = reasons.slice(0, 3);

  let verdict: NicheVerdict;
  if (score >= 70) verdict = "Enter";
  else if (score >= 45) verdict = "Test";
  else verdict = "Avoid";

  return { score, verdict, reasons: topReasons };
}
