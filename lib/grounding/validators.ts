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
const authorizationEvidence = /\b(?:authorized to work|work authorization|right to work|work permit|visa)\b/i;
const durationPattern = /\b(\d+)\s*(?:\+|plus|or more)?\s*(months?|years?|yrs?)\b/i;
const productionContext = /\b(?:production|professional(?:ly)?|employed|employment|full[- ]time|worked\s+(?:at|for)|(?:engineer|developer)\s+at|customers?)\b/i;
const employmentDurationContext = /\b\d+\s*(?:months?|years?|yrs?)\b[^a-z]{0,3}(?:at|as)\b/i;
const personalProjectContext = /\b(?:personal|non-commercial|not used by (?:production )?customers?|testnet)\b/i;
const genericCareerWords = new Set(["and", "the", "with", "for", "from", "years", "year", "months", "month", "professional", "experience", "production", "building", "developer", "engineer", "work", "using", "must", "required", "require", "skill", "skills", "knowledge", "ability", "least"]);

function locationTerms(text: string) {
  return Array.from(text.matchAll(/\b(?:in|from|to|within|at)\s+([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)?)/g), (match) =>
    match[1].toLowerCase(),
  );
}

function isExplicitConstraintConflict(requirement: Requirement | undefined, item: EvidenceItem) {
  if (item.type !== "constraint_fact" || item.strength !== "direct" || !explicitRestriction.test(item.exactQuote)) return false;
  if (globallyExclusiveRestriction.test(item.exactQuote)) return true;
  if (!requirement) return true;
  const requirementLocations = locationTerms(requirement.sources.map((source) => source.exactQuote).join(" "));
  const evidenceLocations = locationTerms(item.exactQuote);
  return requirementLocations.some((location) => evidenceLocations.includes(location));
}

function constraintEvidenceSupports(requirement: Requirement | undefined, item: EvidenceItem) {
  if (!requirement?.mayBeHardConstraint) return true;
  if (item.type !== "constraint_fact" || item.strength !== "direct") return false;
  const requirementLocations = locationTerms(requirementQuotes(requirement));
  const evidenceLocations = locationTerms(item.exactQuote);
  const sameLocation = !requirementLocations.length || requirementLocations.some((location) => evidenceLocations.includes(location));
  if (!sameLocation) return false;
  if (requirement.category === "work_authorization") return authorizationEvidence.test(item.exactQuote);
  if (requirement.category === "location_or_work_mode") return evidenceLocations.length > 0;
  return true;
}

const technicalAliases: Record<string, string[]> = {
  react: ["react.js", "reactjs", "react"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js"],
  nextjs: ["next.js", "nextjs"],
  react_testing_library: ["react testing library", "rtl"],
  tanstack_query: ["tanstack query", "tanstack-query", "tanstackquery"],
};
const technicalAliasEntries = Object.entries(technicalAliases)
  .flatMap(([canonical, aliases]) => aliases.map((alias) => ({ canonical, alias })))
  .sort((left, right) => right.alias.length - left.alias.length);
const genericTechnicalWords = new Set([
  ...genericCareerWords,
  "modern", "frontend", "backend", "fullstack", "framework", "frameworks",
  "stack", "technology", "technologies", "technical", "development", "software",
  "application", "applications", "interface", "interfaces", "feature", "features",
  "web", "service", "services", "platform", "platforms", "system", "systems",
  "team", "product", "products", "role", "position", "candidate", "strong",
  "proficient", "familiar", "including", "such", "also", "will", "should",
  "built", "build", "builds", "delivery", "deliver", "delivered", "delivering",
  "implementation", "implement", "implemented", "integrate", "integrated", "integration",
  "maintain", "maintained", "maintenance", "use", "used", "create", "created",
  "design", "designed", "develop", "developed", "developer", "engineering",
  "customer", "customers", "user", "users", "business", "domain", "workflow", "workflows",
  "wallet", "wallets", "caching", "cache", "performance", "optimization", "quality",
  "testing", "test", "tests", "suite", "suites", "code", "data", "state", "server", "client",
]);

const technicalFamilies = [
  new Set(["react", "vue", "angular", "svelte"]),
  new Set(["jest", "vitest"]),
];

function requirementQuotes(requirement: Requirement | undefined) {
  return requirement?.sources.map((source) => source.exactQuote).join(" ") ?? "";
}

export function extractTechnicalTokens(text: string) {
  let remainder = text.toLowerCase();
  const terms = new Set<string>();
  for (const { canonical, alias } of technicalAliasEntries) {
    if (terms.has(canonical)) continue;
    const pattern = new RegExp(`\\b${alias.replace(/[+#.]/g, "\\$&")}\\b`, "gi");
    if (pattern.test(remainder)) {
      terms.add(canonical);
      remainder = remainder.replace(pattern, " ");
    }
  }
  for (const token of remainder.match(/[a-z][a-z0-9]*(?:[._/+:#-][a-z0-9+#-]+)*/gi) ?? []) {
    const normalized = token.toLowerCase().replace(/^[._/+:#-]+|[._/+:#-]+$/g, "");
    if (normalized.length >= 3 && !genericTechnicalWords.has(normalized)) terms.add(normalized);
  }
  return terms;
}

type TechnicalCoverage = "none" | "partial" | "complete";

function requiredTechnicalTerms(requirement: Requirement) {
  return extractTechnicalTokens(requirementQuotes(requirement));
}

function availableTechnicalTerms(item: EvidenceItem) {
  return extractTechnicalTokens(item.exactQuote);
}

function technicalRequirementUsesDisjunction(requirement: Requirement) {
  return /\b(?:either\s+)?or\b/i.test(requirementQuotes(requirement));
}

function technicalCoverage(required: Set<string>, available: Set<string>, usesDisjunction: boolean): TechnicalCoverage {
  const covered = [...required].filter((term) => available.has(term));
  if (!covered.length) return "none";
  return (usesDisjunction || covered.length === required.size) ? "complete" : "partial";
}

function termsShareTechnicalFamily(required: Set<string>, available: Set<string>) {
  return technicalFamilies.some((family) =>
    [...required].some((term) => family.has(term)) && [...available].some((term) => family.has(term)),
  );
}

function technicalCoverageForEvidence(requirement: Requirement, item: EvidenceItem): TechnicalCoverage {
  const required = requiredTechnicalTerms(requirement);
  // A vague technical requirement cannot be upgraded by its generated label.
  if (!required.size) return "none";
  return technicalCoverage(required, availableTechnicalTerms(item), technicalRequirementUsesDisjunction(requirement));
}

function technicalLinkSupport(requirement: Requirement | undefined, item: EvidenceItem, relationship: Match["links"][number]["relationship"]) {
  if (!requirement || requirement.category !== "technical_skill") return "complete" as const;
  const directCoverage = technicalCoverageForEvidence(requirement, item);
  if (directCoverage !== "none") return directCoverage;
  if (relationship !== "transferable") return "none" as const;
  const required = requiredTechnicalTerms(requirement);
  const available = availableTechnicalTerms(item);
  // Transferability is an explicit, narrow policy rather than a model assertion:
  // both original quotes must name technologies from the same maintained family.
  return required.size && available.size && termsShareTechnicalFamily(required, available)
    ? "partial"
    : "none";
}

function directTechnicalCoverageAcrossEvidence(requirement: Requirement | undefined, links: Array<{ link: Match["links"][number]; item: EvidenceItem }>): TechnicalCoverage {
  if (!requirement || requirement.category !== "technical_skill") return "complete";
  const required = requiredTechnicalTerms(requirement);
  if (!required.size) return "none";
  const available = new Set<string>();
  links
    .filter(({ link, item }) => link.relationship === "direct" && item.strength === "direct")
    .forEach(({ item }) => availableTechnicalTerms(item).forEach((term) => available.add(term)));
  return technicalCoverage(required, available, technicalRequirementUsesDisjunction(requirement));
}

function technicalEvidenceCoversRequirement(requirement: Requirement | undefined, item: EvidenceItem) {
  if (!requirement) return true;
  const required = requiredTechnicalTerms(requirement);
  if (!required.size) return true;
  return technicalCoverage(required, availableTechnicalTerms(item), technicalRequirementUsesDisjunction(requirement)) === "complete";
}

function evidenceQuoteSupportsRequirement(requirement: Requirement | undefined, item: EvidenceItem) {
  if (!requirement || requirement.mayBeHardConstraint) return true;
  if (requirement.category === "technical_skill") return true;
  const requiredWords = meaningfulWords(requirementQuotes(requirement));
  if (!requiredWords.size) return true;
  const evidenceWords = meaningfulWords(item.exactQuote);
  return [...requiredWords].some((word) => evidenceWords.has(word));
}

function durationInMonths(text: string) {
  const match = text.match(durationPattern);
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return /year|yr/i.test(match[2]) ? quantity * 12 : quantity;
}

function isDirectProductionEvidence(item: EvidenceItem) {
  const quote = item.exactQuote;
  return (
    item.type === "production_experience" &&
    item.strength === "direct" &&
    !personalProjectContext.test(quote) &&
    (productionContext.test(quote) || employmentDurationContext.test(quote))
  );
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
  const requiredMonths = durationInMonths(requirementQuotes(requirement));
  if (!requiredMonths) return undefined;
  const requirementWords = meaningfulWords(requirementQuotes(requirement));
  return evidence.find((item) => {
    const availableMonths = durationInMonths(item.exactQuote);
    if (
      !isDirectProductionEvidence(item) ||
      !availableMonths
    ) return false;
    const evidenceWords = meaningfulWords(item.exactQuote);
    return [...requirementWords].some((word) => evidenceWords.has(word));
  });
}

function durationGap(requirement: Requirement | undefined, item: EvidenceItem, outputLanguage: "en" | "zh-CN") {
  const requiredMonths = durationInMonths(
    requirementQuotes(requirement),
  );
  const availableMonths = durationInMonths(item.exactQuote);
  if (!requiredMonths || !availableMonths) return undefined;
  const difference = requiredMonths - availableMonths;
  return outputLanguage === "zh-CN"
    ? `要求至少 ${requiredMonths} 个月；现有证据为 ${availableMonths} 个月，尚有 ${difference} 个月的明显差距`
    : `Requires at least ${requiredMonths} months; available evidence shows ${availableMonths} months, leaving a material ${difference}-month gap`;
}

export function validateAndDowngradeMatch(match: Omit<Match, "status">, evidence: EvidenceItem[], requirement?: Requirement, outputLanguage: "en" | "zh-CN" = "en"): Match {
  const seen = new Set<string>();
  const links = match.links.filter((link) => !seen.has(link.evidenceId) && Boolean(seen.add(link.evidenceId))).map((link) => ({ link, item: evidence.find((item) => item.id === link.evidenceId) })).filter((value): value is { link: Match["links"][number]; item: EvidenceItem } => Boolean(value.item && value.item.reviewState !== "excluded"));
  const requirementText = requirementQuotes(requirement);
  const requiresProduction = Boolean(requirement && (requirement.category === "experience" || productionRequirement.test(requirementText) || yearRequirement.test(requirementText)));
  const hasExplicitYears = Boolean(requirement && yearRequirement.test(requirementText));
  const supported = links.filter(({ link, item }) =>
    (link.relationship === "direct" || link.relationship === "transferable") &&
    technicalLinkSupport(requirement, item, link.relationship) !== "none" &&
    evidenceQuoteSupportsRequirement(requirement, item) &&
    constraintEvidenceSupports(requirement, item),
  );
  const durationEvidence = hasExplicitYears
    ? compatibleDurationEvidence(requirement, evidence)
    : undefined;
  const inferredDuration = !supported.length ? durationEvidence : undefined;
  if (inferredDuration) {
    links.push({
      link: { evidenceId: inferredDuration.id, relationship: "direct" },
      item: inferredDuration,
    });
    if (evidenceQuoteSupportsRequirement(requirement, inferredDuration)) {
      supported.push(links[links.length - 1]);
    }
  }
  const requiredMonths = hasExplicitYears ? durationInMonths(requirementText) : undefined;
  const hasDirect = supported.some(({ item, link }) => {
    if (item.strength !== "direct" || link.relationship !== "direct") return false;
    if (requirement?.category === "technical_skill" && directTechnicalCoverageAcrossEvidence(requirement, supported) !== "complete") return false;
    if (requiresProduction && !isDirectProductionEvidence(item)) return false;
    if (!hasExplicitYears) return true;
    if (!technicalEvidenceCoversRequirement(requirement, item)) return false;
    const availableMonths = durationInMonths(item.exactQuote);
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
      status === "partial_match" && durationEvidence && requiredMonths && durationInMonths(durationEvidence.exactQuote)! < requiredMonths
        ? durationGap(requirement, durationEvidence, outputLanguage)
        : match.gap,
  };
}
