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
const durationPattern = /\b(\d+)\s*(?:\+|plus|or more)?\s*(months?|years?|yrs?)\b/i;
const genericCareerWords = new Set(["and", "the", "with", "for", "from", "years", "year", "months", "month", "professional", "experience", "production", "building", "developer", "engineer", "work", "using"]);

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

function durationInMonths(text: string) {
  const match = text.match(durationPattern);
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return /year|yr/i.test(match[2]) ? quantity * 12 : quantity;
}

function meaningfulWords(text: string) {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) ?? []).filter(
      (word) => word.length > 2 && !genericCareerWords.has(word),
    ),
  );
}

function compatibleDurationEvidence(requirement: Requirement | undefined, evidence: EvidenceItem[]) {
  if (!requirement) return undefined;
  const requiredMonths = durationInMonths(
    [requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" "),
  );
  if (!requiredMonths) return undefined;
  const requirementWords = meaningfulWords(
    [requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" "),
  );
  return evidence.find((item) => {
    const availableMonths = durationInMonths(`${item.claim} ${item.exactQuote}`);
    if (
      item.type !== "production_experience" ||
      item.strength !== "direct" ||
      !availableMonths
    ) return false;
    const evidenceWords = meaningfulWords(`${item.claim} ${item.exactQuote}`);
    return [...requirementWords].some((word) => evidenceWords.has(word));
  });
}

function durationGap(requirement: Requirement | undefined, item: EvidenceItem, outputLanguage: "en" | "zh-CN") {
  const requiredMonths = durationInMonths(
    [requirement?.label, ...(requirement?.sources.map((source) => source.exactQuote) ?? [])]
      .filter(Boolean)
      .join(" "),
  );
  const availableMonths = durationInMonths(`${item.claim} ${item.exactQuote}`);
  if (!requiredMonths || !availableMonths) return undefined;
  const difference = requiredMonths - availableMonths;
  return outputLanguage === "zh-CN"
    ? `要求至少 ${requiredMonths} 个月；现有证据为 ${availableMonths} 个月，尚有 ${difference} 个月的明显差距`
    : `Requires at least ${requiredMonths} months; available evidence shows ${availableMonths} months, leaving a material ${difference}-month gap`;
}

export function validateAndDowngradeMatch(match: Omit<Match, "status">, evidence: EvidenceItem[], requirement?: Requirement, outputLanguage: "en" | "zh-CN" = "en"): Match {
  const seen = new Set<string>();
  const links = match.links.filter((link) => !seen.has(link.evidenceId) && Boolean(seen.add(link.evidenceId))).map((link) => ({ link, item: evidence.find((item) => item.id === link.evidenceId) })).filter((value): value is { link: Match["links"][number]; item: EvidenceItem } => Boolean(value.item && value.item.reviewState !== "excluded"));
  const requirementText = requirement ? [requirement.label, ...requirement.sources.map((source) => source.exactQuote)].join(" ") : "";
  const requiresProduction = Boolean(requirement && (requirement.category === "experience" || productionRequirement.test(requirementText) || yearRequirement.test(requirementText)));
  const hasExplicitYears = Boolean(requirement && yearRequirement.test(requirementText));
  const supported = links.filter(({ link }) => link.relationship === "direct" || link.relationship === "transferable");
  const durationEvidence = hasExplicitYears
    ? compatibleDurationEvidence(requirement, evidence)
    : undefined;
  const inferredDuration = !supported.length ? durationEvidence : undefined;
  if (inferredDuration) {
    links.push({
      link: { evidenceId: inferredDuration.id, relationship: "direct" },
      item: inferredDuration,
    });
    supported.push(links[links.length - 1]);
  }
  const requiredMonths = hasExplicitYears ? durationInMonths(requirementText) : undefined;
  const hasDirect = supported.some(({ item, link }) => {
    if (item.strength !== "direct" || link.relationship !== "direct") return false;
    if (requiresProduction && item.type !== "production_experience") return false;
    if (!hasExplicitYears) return true;
    const availableMonths = durationInMonths(`${item.claim} ${item.exactQuote}`);
    return Boolean(requiredMonths && availableMonths && availableMonths >= requiredMonths);
  });
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
  return {
    ...match,
    status,
    links: links.map(({ link }) => link),
    gap:
      status === "partial_match" && durationEvidence && requiredMonths && durationInMonths(`${durationEvidence.claim} ${durationEvidence.exactQuote}`)! < requiredMonths
        ? durationGap(requirement, durationEvidence, outputLanguage)
        : match.gap,
  };
}
