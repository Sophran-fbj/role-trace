import type { Analysis, AppStore, CandidateProfile } from "@/domain/types";
import { SCHEMA_VERSION } from "@/domain/types";

const key = "applylens.store";
const blank = (): AppStore => ({ schemaVersion: SCHEMA_VERSION, analyses: [] });
export function loadStore(): AppStore { if (typeof window === "undefined") return blank(); try { const raw = localStorage.getItem(key); if (!raw) return blank(); const parsed = JSON.parse(raw) as AppStore; return parsed.schemaVersion === SCHEMA_VERSION ? parsed : blank(); } catch { return blank(); } }
export function saveProfile(profile: CandidateProfile) { const store = loadStore(); localStorage.setItem(key, JSON.stringify({ ...store, profile })); }
export function saveAnalysis(analysis: Analysis) { const store = loadStore(); const analyses = [analysis, ...store.analyses.filter((item) => item.id !== analysis.id)]; localStorage.setItem(key, JSON.stringify({ ...store, analyses })); }
export function clearLocalData() { localStorage.removeItem(key); }
