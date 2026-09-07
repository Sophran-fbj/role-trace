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

export function validateAndDowngradeMatch(match: Omit<Match, "status">, evidence: EvidenceItem[], requirement?: Requirement): Match {
  const seen = new Set<string>();
  const links = match.links.filter((link) => !seen.has(link.evidenceId) && Boolean(seen.add(link.evidenceId))).map((link) => ({ link, item: evidence.find((item) => item.id === link.evidenceId) })).filter((value): value is { link: Match["links"][number]; item: EvidenceItem } => Boolean(value.item && value.item.reviewState !== "excluded"));
  const requirementText = requirement ? [requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" ") : "";
  const requiresProduction = Boolean(requirement && (requirement.category === "experience" || /\bproduction\b|\b\d+\+? years?\b/i.test(requirementText)));
  const hasExplicitYears = Boolean(requirement && /\b\d+\+? years?\b/i.test(requirementText));
  const hasDirect = !hasExplicitYears && links.some(({ item, link }) => item.strength === "direct" && link.relationship === "direct" && (!requiresProduction || item.type === "production_experience"));
  let status = match.proposedStatus;
  if (status === "strong_match" && !hasDirect) status = links.length ? "partial_match" : "no_evidence_provided";
  if (status === "partial_match" && !links.length) status = "no_evidence_provided";
  if (status === "conflicting_evidence" && !links.length) status = "unknown";
  if (match.links.some((link) => !evidence.some((item) => item.id === link.evidenceId))) status = "no_evidence_provided";
  return { ...match, status, links: links.map(({ link }) => link) };
}
