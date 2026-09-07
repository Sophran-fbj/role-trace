import type { EvidenceItem, Match, Requirement, SourceBlock } from "@/domain/types";

export const normalizeQuote = (value: string) => value.replace(/\s+/g, " ").trim();
export const quoteIsInBlock = (quote: string, block: SourceBlock) => Boolean(normalizeQuote(quote)) && normalizeQuote(block.text).includes(normalizeQuote(quote));

export function validEvidence(item: Omit<EvidenceItem, "id" | "reviewState"> | EvidenceItem, blocks: SourceBlock[]) {
  const block = blocks.find((candidate) => candidate.id === item.sourceBlockId);
  return Boolean(block && quoteIsInBlock(item.exactQuote, block));
}

export function validRequirement(item: Requirement, blocks: SourceBlock[]) {
  return item.sources.length > 0 && item.sources.every((source) => {
    const block = blocks.find((candidate) => candidate.id === source.sourceBlockId);
    return Boolean(block && quoteIsInBlock(source.exactQuote, block));
  });
}

const yearRequirement = /\b(?:at\s+least\s+)?\d+\s*(?:\+|plus|or more)?\s*(?:years?|yrs?)\b/i;
const productionRequirement = /\bproduction\b/i;
const explicitRestriction = /\b(?:cannot|can(?:not|'t)|unable to|not able to|not authorized(?: to work)?|ineligible|only (?:work|available)|must remain|must stay|cannot relocate|not willing to relocate)\b/i;
const globallyExclusiveRestriction = /\b(?:only (?:work|available)|must remain|must stay)\b/i;

function locationTerms(text: string) {
  return Array.from(text.matchAll(/\b(?:in|from|to|within|at)\s+([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)?)/g), (match) =>
    match[1].toLowerCase(),
  );
}

function isExplicitConstraintConflict(requirement: Requirement | undefined, item: EvidenceItem) {
  if (item.type !== "constraint_fact" || item.strength !== "direct" || !explicitRestriction.test(item.exactQuote)) return false;
  if (globallyExclusiveRestriction.test(item.exactQuote)) return true;
  if (!requirement) return true;
  const requirementLocations = locationTerms([requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" "));
  const evidenceLocations = locationTerms(item.exactQuote);
  return requirementLocations.some((location) => evidenceLocations.includes(location));
}

export function validateAndDowngradeMatch(match: Omit<Match, "status">, evidence: EvidenceItem[], requirement?: Requirement): Match {
  const seen = new Set<string>();
  const links = match.links.filter((link) => !seen.has(link.evidenceId) && Boolean(seen.add(link.evidenceId))).map((link) => ({ link, item: evidence.find((item) => item.id === link.evidenceId) })).filter((value): value is { link: Match["links"][number]; item: EvidenceItem } => Boolean(value.item && value.item.reviewState !== "excluded"));
  const requirementText = requirement ? [requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" ") : "";
  const requiresProduction = Boolean(requirement && (requirement.category === "experience" || productionRequirement.test(requirementText) || yearRequirement.test(requirementText)));
  const hasExplicitYears = Boolean(requirement && yearRequirement.test(requirementText));
  const supported = links.filter(({ link }) => link.relationship === "direct" || link.relationship === "transferable");
  const hasDirect = !hasExplicitYears && supported.some(({ item, link }) => item.strength === "direct" && link.relationship === "direct" && (!requiresProduction || item.type === "production_experience"));
  const noSupportStatus = requirement?.mayBeHardConstraint ? "unknown" : "no_evidence_provided";
  let status = match.proposedStatus;
  if (match.links.some((link) => !evidence.some((item) => item.id === link.evidenceId))) status = noSupportStatus;
  else if (status === "conflicting_evidence") {
    status = links.some(({ item, link }) => link.relationship === "direct" && isExplicitConstraintConflict(requirement, item))
      ? "conflicting_evidence"
      : noSupportStatus;
  } else if (status === "strong_match") status = hasDirect ? "strong_match" : supported.length ? "partial_match" : noSupportStatus;
  else if (status === "partial_match") status = supported.length ? "partial_match" : noSupportStatus;
  else if (status === "no_evidence_provided") status = supported.length ? "partial_match" : "no_evidence_provided";
  else if (status === "unknown") status = requirement?.mayBeHardConstraint ? "unknown" : supported.length ? "partial_match" : "no_evidence_provided";
  return { ...match, status, links: links.map(({ link }) => link) };
}
