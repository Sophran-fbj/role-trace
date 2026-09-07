import type { Analysis, CandidateProfile, Job } from "@/domain/types";
import { RULE_VERSION, SCHEMA_VERSION } from "@/domain/types";
import { segmentDocuments } from "@/lib/grounding/segmentation";

const now = "2026-09-07T12:00:00.000Z";
const documents = [
  { id: "sample-resume", title: "Maya Chen — Resume", kind: "resume" as const, text: "Maya Chen\nFrontend engineer focused on reliable product interfaces.\n\nNorthstar Labs — Frontend Engineer (2024–present)\nBuilt and shipped customer-facing React and TypeScript features for a B2B analytics platform. Partnered with product and design to own features from discovery through release.\n\nOrbit Wallet — Contract Developer (2023–2024)\nImplemented transaction history and wallet connection flows with React, TypeScript, and wagmi. Wrote component tests and improved accessibility for keyboard navigation." },
  { id: "sample-project", title: "Protocol Desk", kind: "project" as const, text: "Protocol Desk — personal project\nBuilt a responsive DeFi dashboard using Next.js, TypeScript, and viem. Integrated read-only on-chain data and documented architecture decisions. This was a personal project, not production employment." },
];
export const sampleProfile: CandidateProfile = {
  id: "sample-profile", displayName: "Maya Chen", documents, sourceBlocks: segmentDocuments(documents), createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION,
  evidence: [
    { id: "ev-1", claim: "Shipped React and TypeScript features for a B2B analytics platform.", sourceBlockId: "sample-resume:block:2", exactQuote: "Built and shipped customer-facing React and TypeScript features for a B2B analytics platform.", type: "production_experience", strength: "direct", tags: ["React", "TypeScript", "B2B"], reviewState: "verified" },
    { id: "ev-2", claim: "Owned features with product and design from discovery through release.", sourceBlockId: "sample-resume:block:2", exactQuote: "Partnered with product and design to own features from discovery through release.", type: "work_responsibility", strength: "direct", tags: ["product", "design", "ownership"], reviewState: "verified" },
    { id: "ev-3", claim: "Built a personal DeFi dashboard with Next.js, TypeScript, and viem.", sourceBlockId: "sample-project:block:1", exactQuote: "Built a responsive DeFi dashboard using Next.js, TypeScript, and viem.", type: "project_experience", strength: "direct", tags: ["DeFi", "Next.js", "viem"], reviewState: "pending" },
  ],
};
export const sampleJob: Job = { id: "sample-job", title: "Frontend Engineer", company: "Harbor Protocol", createdAt: now, rawText: "Harbor Protocol is hiring a Frontend Engineer. You will build production React and TypeScript interfaces for DeFi users, work closely with product and design, and own features end to end. Experience with wallet integrations and GraphQL is preferred. You must be able to work from Singapore three days a week." };
export const sampleAnalysis: Analysis = {
  id: "sample-analysis", job: sampleJob, profileUpdatedAt: now, profileSnapshot: { id: sampleProfile.id, documents: sampleProfile.documents, sourceBlocks: sampleProfile.sourceBlocks, evidence: sampleProfile.evidence, updatedAt: now }, schemaVersion: SCHEMA_VERSION, ruleVersion: RULE_VERSION, createdAt: now, isSample: true, constraints: [{ requirementId: "req-6", status: "unresolved", detail: "The profile does not state whether Maya can work from Singapore three days a week.", evidenceIds: [] }], recommendation: "need_more_information",
  requirements: [
    { id: "req-1", label: "Production React and TypeScript interfaces", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "build production React and TypeScript interfaces for DeFi users" }], mayBeHardConstraint: false },
    { id: "req-2", label: "Work closely with product and design", category: "collaboration", priority: "core", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "work closely with product and design" }], mayBeHardConstraint: false },
    { id: "req-3", label: "Own features end to end", category: "responsibility", priority: "core", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "own features end to end" }], mayBeHardConstraint: false },
    { id: "req-4", label: "Wallet integrations", category: "technical_skill", priority: "preferred", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "Experience with wallet integrations" }], mayBeHardConstraint: false },
    { id: "req-5", label: "GraphQL", category: "technical_skill", priority: "preferred", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "GraphQL is preferred" }], mayBeHardConstraint: false },
    { id: "req-6", label: "Work from Singapore three days a week", category: "location_or_work_mode", priority: "core", sources: [{ sourceBlockId: "sample-job:block:1", exactQuote: "must be able to work from Singapore three days a week" }], mayBeHardConstraint: true },
  ],
  matches: [
    { requirementId: "req-1", proposedStatus: "strong_match", status: "strong_match", links: [{ evidenceId: "ev-1", relationship: "direct" }], rationale: "Direct production evidence for both named technologies." },
    { requirementId: "req-2", proposedStatus: "strong_match", status: "strong_match", links: [{ evidenceId: "ev-2", relationship: "direct" }], rationale: "The evidence explicitly names product and design collaboration." },
    { requirementId: "req-3", proposedStatus: "strong_match", status: "strong_match", links: [{ evidenceId: "ev-2", relationship: "direct" }], rationale: "The evidence explicitly describes end-to-end ownership." },
    { requirementId: "req-4", proposedStatus: "partial_match", status: "partial_match", links: [{ evidenceId: "ev-3", relationship: "transferable" }], gap: "Production context is not evidenced.", rationale: "Relevant wallet work is present." },
    { requirementId: "req-5", proposedStatus: "no_evidence_provided", status: "no_evidence_provided", links: [], gap: "GraphQL is not evidenced.", rationale: null },
    { requirementId: "req-6", proposedStatus: "unknown", status: "unknown", links: [], gap: "Location availability is not provided.", rationale: null },
  ],
  reasons: ["Production React and TypeScript evidence supports the primary engineering requirement.", "Evidence shows direct collaboration with product and design and end-to-end ownership.", "Singapore availability is required but not evidenced, so a responsible decision needs confirmation."],
  emphasis: [{ title: "Production React + TypeScript delivery", evidenceIds: ["ev-1"], requirementIds: ["req-1"], rationale: "It directly supports a core requirement.", angle: "Lead with shipped customer-facing work and the product context.", doNotClaim: "Do not present the personal DeFi project as production work." }, { title: "End-to-end collaboration", evidenceIds: ["ev-2"], requirementIds: ["req-2", "req-3"], rationale: "It maps to two core responsibilities.", angle: "Explain how you partnered with product and design through release.", doNotClaim: "Do not add outcomes that are not in the source material." }],
  questions: [{ question: "How did you take a customer-facing React feature from discovery through release?", whyThisMayBeAsked: "The role requires end-to-end ownership.", requirementIds: ["req-3"], evidenceIds: ["ev-2"], preparationNote: "Start with the Northstar example and stay within the stated evidence.", type: "evidence_deep_dive" }, { question: "Are you able to work from Singapore three days a week?", whyThisMayBeAsked: "This is an explicit location constraint.", requirementIds: ["req-6"], evidenceIds: [], preparationNote: "Prepare an honest availability answer; the profile contains no evidence either way.", type: "constraint_clarification" }],
};
