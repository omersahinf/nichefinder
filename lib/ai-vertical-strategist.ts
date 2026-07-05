import { runNicheCandidateAdjacentStrategist } from "./niche-graph-discovery";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

export async function runAiVerticalStrategist(): Promise<KeywordDiscoveryResult> {
  return runNicheCandidateAdjacentStrategist("ai:vertical-strategist");
}
