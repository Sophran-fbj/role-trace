import { z } from "zod";

export const evidenceProposalSchema = z.object({
  claim: z.string().min(1).max(240),
  sourceBlockId: z.string().min(1),
  exactQuote: z.string().min(1),
  type: z.enum(["production_experience", "project_experience", "work_responsibility", "measurable_outcome", "domain_experience", "education_or_certification", "constraint_fact", "self_asserted_skill", "other"]),
  strength: z.enum(["direct", "transferable", "weak"]),
  tags: z.array(z.string().min(1).max(40)).max(8),
});

export const evidenceExtractionSchema = z.object({
  evidence: z.array(evidenceProposalSchema).max(60),
});

export type EvidenceProposal = z.infer<typeof evidenceProposalSchema>;
export const EVIDENCE_SCHEMA_VERSION = "2026-09-07.1";

export const requirementProposalSchema = z.object({
  label: z.string().min(1).max(180),
  category: z.enum(["technical_skill", "experience", "responsibility", "domain", "collaboration", "education_or_certification", "language", "location_or_work_mode", "work_authorization", "other"]),
  priority: z.enum(["core", "preferred", "context", "uncertain"]),
  sources: z.array(z.object({ sourceBlockId: z.string().min(1), exactQuote: z.string().min(1) })).min(1).max(8),
  mayBeHardConstraint: z.boolean(),
  note: z.string().max(300).nullable(),
});
export const requirementExtractionSchema = z.object({ requirements: z.array(requirementProposalSchema).max(50) });

export const matchProposalSchema = z.object({
  requirementId: z.string().min(1),
  proposedStatus: z.enum(["strong_match", "partial_match", "no_evidence_provided", "conflicting_evidence", "unknown"]),
  links: z.array(z.object({ evidenceId: z.string().min(1), relationship: z.enum(["direct", "transferable", "context_only"]) })).max(8),
  gap: z.string().max(300).nullable(),
  rationale: z.string().max(400).nullable(),
});
export const analysisPreparationSchema = z.object({
  matches: z.array(matchProposalSchema).max(50),
  emphasis: z.array(z.object({ title: z.string().min(1).max(120), evidenceIds: z.array(z.string()).min(1).max(6), requirementIds: z.array(z.string()).min(1).max(6), rationale: z.string().max(280), angle: z.string().max(280), doNotClaim: z.string().max(280) })).max(5),
  questions: z.array(z.object({ question: z.string().min(1).max(300), whyThisMayBeAsked: z.string().max(280), requirementIds: z.array(z.string()).min(1).max(4), evidenceIds: z.array(z.string()).max(4), preparationNote: z.string().max(300), type: z.enum(["evidence_deep_dive", "gap_probe", "technical_validation", "behavioral", "constraint_clarification"]) })).max(6),
});
export const ANALYSIS_SCHEMA_VERSION = "2026-09-07.1";
