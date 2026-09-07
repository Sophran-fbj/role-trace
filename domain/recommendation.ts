import type { Constraint, Match, Recommendation, Requirement } from "@/domain/types";

export function decideRecommendation(requirements: Requirement[], matches: Match[], constraints: Constraint[]): Recommendation {
  if (constraints.some((item) => item.status === "confirmed")) return "skip";
  if (constraints.some((item) => item.status === "unresolved")) return "need_more_information";
  const core = requirements.filter((item) => item.priority === "core");
  if (!core.length) return "need_more_information";
  const coreMatches = core.map((item) => matches.find((match) => match.requirementId === item.id));
  const supported = coreMatches.filter((item) => item?.status === "strong_match" || item?.status === "partial_match").length;
  const strong = coreMatches.filter((item) => item?.status === "strong_match").length;
  const supportRatio = supported / core.length;
  const strongRatio = strong / core.length;
  if (supportRatio >= 0.7 && strongRatio >= 0.35) return "apply";
  if (supportRatio >= 0.4 && coreMatches.some((item) => item?.links.some((link) => link.relationship === "direct" || link.relationship === "transferable"))) return "consider";
  return "skip";
}
