import type { Constraint, Match, Recommendation, Requirement } from "@/domain/types";

export function decideRecommendation(requirements: Requirement[], matches: Match[], constraints: Constraint[]): Recommendation {
  if (constraints.some((item) => item.status === "confirmed")) return "skip";
  if (constraints.some((item) => item.status === "unresolved")) return "need_more_information";
  const core = requirements.filter((item) => item.priority === "core");
  if (!core.length) return "need_more_information";
  const coreMatches = core.map((item) => matches.find((match) => match.requirementId === item.id));
  const weightedSupport = coreMatches.reduce((total, item) => total + (item?.status === "strong_match" ? 1 : item?.status === "partial_match" ? 0.5 : 0), 0);
  const strong = coreMatches.filter((item) => item?.status === "strong_match").length;
  const supportRatio = weightedSupport / core.length;
  const strongRatio = strong / core.length;
  if (supportRatio >= 0.8 && strongRatio >= 0.5) return "apply";
  const hasUsableEvidence = coreMatches.some((item) => item?.links.some((link) => link.relationship === "direct" || link.relationship === "transferable"));
  // A candidate with a substantial, source-backed core match remains worth considering
  // even when one of a small number of core requirements is unavailable in the material.
  if (supportRatio >= 0.35 && hasUsableEvidence) return "consider";
  return "skip";
}
