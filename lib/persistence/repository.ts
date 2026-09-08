import { z } from "zod";
import type { Analysis, AppStore, CandidateProfile } from "@/domain/types";
import { SCHEMA_VERSION } from "@/domain/types";

const key = "applylens.store";
const evidenceType = z.enum(["production_experience", "project_experience", "work_responsibility", "measurable_outcome", "domain_experience", "education_or_certification", "constraint_fact", "self_asserted_skill", "other"]);
const reviewState = z.enum(["pending", "verified", "edited", "excluded"]);
const evidenceSchema = z.object({ id: z.string().min(1), claim: z.string(), sourceBlockId: z.string().min(1), exactQuote: z.string().min(1), type: evidenceType, strength: z.enum(["direct", "transferable", "weak"]), tags: z.array(z.string()), reviewState });
const documentSchema = z.object({ id: z.string().min(1), title: z.string(), kind: z.enum(["resume", "project", "notes"]), text: z.string() });
const sourceBlockSchema = z.object({ id: z.string().min(1), documentId: z.string().min(1), index: z.number().int().nonnegative(), heading: z.string().optional(), text: z.string() });
const profileSchema = z.object({ id: z.string().min(1), displayName: z.string().optional(), documents: z.array(documentSchema).min(1).max(6), sourceBlocks: z.array(sourceBlockSchema), evidence: z.array(evidenceSchema), createdAt: z.string().min(1), updatedAt: z.string().min(1), schemaVersion: z.number().int() });
const requirementSchema = z.object({ id: z.string().min(1), label: z.string(), category: z.enum(["technical_skill", "experience", "responsibility", "domain", "collaboration", "education_or_certification", "language", "location_or_work_mode", "work_authorization", "other"]), priority: z.enum(["core", "preferred", "context", "uncertain"]), sources: z.array(z.object({ sourceBlockId: z.string().min(1), exactQuote: z.string().min(1) })), mayBeHardConstraint: z.boolean(), note: z.string().nullable().optional() });
const matchSchema = z.object({ requirementId: z.string().min(1), proposedStatus: z.enum(["strong_match", "partial_match", "no_evidence_provided", "conflicting_evidence", "unknown"]), status: z.enum(["strong_match", "partial_match", "no_evidence_provided", "conflicting_evidence", "unknown"]), links: z.array(z.object({ evidenceId: z.string().min(1), relationship: z.enum(["direct", "transferable", "context_only"]) })), gap: z.string().nullable().optional(), rationale: z.string().nullable().optional() });
const analysisSchema = z.object({ id: z.string().min(1), job: z.object({ id: z.string().min(1), title: z.string().optional(), company: z.string().optional(), rawText: z.string(), createdAt: z.string().min(1) }), profileUpdatedAt: z.string().min(1), profileSnapshot: z.object({ id: z.string().min(1), documents: z.array(documentSchema), sourceBlocks: z.array(sourceBlockSchema), evidence: z.array(evidenceSchema), updatedAt: z.string().min(1) }), requirements: z.array(requirementSchema), matches: z.array(matchSchema), constraints: z.array(z.object({ requirementId: z.string().min(1), status: z.enum(["confirmed", "unresolved"]), detail: z.string(), evidenceIds: z.array(z.string()) })), recommendation: z.enum(["apply", "consider", "skip", "need_more_information"]), reasons: z.array(z.string()), emphasis: z.array(z.object({ title: z.string(), evidenceIds: z.array(z.string()), requirementIds: z.array(z.string()), rationale: z.string(), angle: z.string(), doNotClaim: z.string() })), questions: z.array(z.object({ question: z.string(), whyThisMayBeAsked: z.string(), requirementIds: z.array(z.string()), evidenceIds: z.array(z.string()), preparationNote: z.string(), type: z.enum(["evidence_deep_dive", "gap_probe", "technical_validation", "behavioral", "constraint_clarification"]) })), createdAt: z.string().min(1), schemaVersion: z.number().int(), ruleVersion: z.string(), isSample: z.boolean().optional() });
const storeSchema = z.object({ schemaVersion: z.literal(SCHEMA_VERSION), profile: profileSchema.optional(), analyses: z.array(analysisSchema) });
const legacyStoreSchema = z.object({ schemaVersion: z.literal(1), profile: profileSchema.optional(), analyses: z.array(analysisSchema).default([]) });

export type StoreLoadStatus = "empty" | "ok" | "migrated" | "invalid" | "future_version";
export type StoreLoadResult = { status: StoreLoadStatus; store?: AppStore };

export class PersistenceError extends Error {
  constructor(readonly code: "future_version" | "write_failed") {
    super(code === "future_version" ? "This browser has data from a newer ApplyLens version. It was not changed." : "This browser could not save ApplyLens data.");
  }
}

const blank = (): AppStore => ({ schemaVersion: SCHEMA_VERSION, analyses: [] });

function migrateLegacyStore(input: unknown): AppStore | undefined {
  const legacy = legacyStoreSchema.safeParse(input);
  if (!legacy.success) return undefined;
  const migrated = { ...legacy.data, schemaVersion: SCHEMA_VERSION, profile: legacy.data.profile && { ...legacy.data.profile, schemaVersion: SCHEMA_VERSION } };
  return storeSchema.safeParse(migrated).success ? (migrated as AppStore) : undefined;
}

export function readStore(): StoreLoadResult {
  if (typeof window === "undefined") return { status: "empty", store: blank() };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { status: "empty", store: blank() };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "schemaVersion" in parsed && typeof parsed.schemaVersion === "number" && parsed.schemaVersion > SCHEMA_VERSION) return { status: "future_version" };
    const current = storeSchema.safeParse(parsed);
    if (current.success) return { status: "ok", store: current.data };
    const migrated = migrateLegacyStore(parsed);
    if (migrated) return { status: "migrated", store: migrated };
    return { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

function writableStore() {
  const result = readStore();
  if (result.status === "future_version") throw new PersistenceError("future_version");
  return result.store ?? blank();
}

function writeStore(store: AppStore) {
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    throw new PersistenceError("write_failed");
  }
}

export function saveProfile(profile: CandidateProfile) {
  writeStore({ ...writableStore(), profile: { ...profile, schemaVersion: SCHEMA_VERSION } });
}

export function saveAnalysis(analysis: Analysis) {
  const store = writableStore();
  writeStore({ ...store, analyses: [analysis, ...store.analyses.filter((item) => item.id !== analysis.id)] });
}

export function clearLocalData() {
  try {
    window.localStorage.removeItem(key);
  } catch {
    throw new PersistenceError("write_failed");
  }
}
