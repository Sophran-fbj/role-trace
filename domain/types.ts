export const SCHEMA_VERSION = 1;
export const RULE_VERSION = "2026-09-07.1";

export type EvidenceType =
  | "production_experience" | "project_experience" | "work_responsibility"
  | "measurable_outcome" | "domain_experience" | "education_or_certification"
  | "constraint_fact" | "self_asserted_skill" | "other";
export type EvidenceStrength = "direct" | "transferable" | "weak";
export type ReviewState = "pending" | "verified" | "edited" | "excluded";
export type RequirementCategory = "technical_skill" | "experience" | "responsibility" | "domain" | "collaboration" | "education_or_certification" | "language" | "location_or_work_mode" | "work_authorization" | "other";
export type RequirementPriority = "core" | "preferred" | "context" | "uncertain";
export type MatchStatus = "strong_match" | "partial_match" | "no_evidence_provided" | "conflicting_evidence" | "unknown";
export type Relationship = "direct" | "transferable" | "context_only";
export type Recommendation = "apply" | "consider" | "skip" | "need_more_information";

export interface SourceDocument { id: string; title: string; kind: "resume" | "project" | "notes"; text: string; }
export interface SourceBlock { id: string; documentId: string; index: number; heading?: string; text: string; }
export interface EvidenceItem { id: string; claim: string; sourceBlockId: string; exactQuote: string; type: EvidenceType; strength: EvidenceStrength; tags: string[]; reviewState: ReviewState; }
export interface RequirementSource { sourceBlockId: string; exactQuote: string; }
export interface Requirement { id: string; label: string; category: RequirementCategory; priority: RequirementPriority; sources: RequirementSource[]; mayBeHardConstraint: boolean; note?: string | null; }
export interface EvidenceLink { evidenceId: string; relationship: Relationship; }
export interface Match { requirementId: string; proposedStatus: MatchStatus; status: MatchStatus; links: EvidenceLink[]; gap?: string | null; rationale?: string | null; }
export interface Constraint { requirementId: string; status: "confirmed" | "unresolved"; detail: string; evidenceIds: string[]; }
export interface EmphasisItem { title: string; evidenceIds: string[]; requirementIds: string[]; rationale: string; angle: string; doNotClaim: string; }
export interface InterviewQuestion { question: string; whyThisMayBeAsked: string; requirementIds: string[]; evidenceIds: string[]; preparationNote: string; type: "evidence_deep_dive" | "gap_probe" | "technical_validation" | "behavioral" | "constraint_clarification"; }
export interface CandidateProfile { id: string; displayName?: string; documents: SourceDocument[]; sourceBlocks: SourceBlock[]; evidence: EvidenceItem[]; createdAt: string; updatedAt: string; schemaVersion: number; }
export interface Job { id: string; title?: string; company?: string; rawText: string; createdAt: string; }
export interface Analysis { id: string; job: Job; profileUpdatedAt: string; profileSnapshot: Pick<CandidateProfile, "id" | "documents" | "sourceBlocks" | "evidence" | "updatedAt">; requirements: Requirement[]; matches: Match[]; constraints: Constraint[]; recommendation: Recommendation; reasons: string[]; emphasis: EmphasisItem[]; questions: InterviewQuestion[]; createdAt: string; schemaVersion: number; ruleVersion: string; isSample?: boolean; }
export interface AppStore { schemaVersion: number; profile?: CandidateProfile; analyses: Analysis[]; }

export const statusLabel: Record<MatchStatus, string> = {
  strong_match: "Strong match", partial_match: "Partial match", no_evidence_provided: "No Evidence Provided", conflicting_evidence: "Conflicting evidence", unknown: "Unknown",
};
