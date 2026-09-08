// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/domain/types";
import { sampleAnalysis, sampleProfile } from "@/fixtures/sample";
import {
  PersistenceError,
  readStore,
  saveAnalysis,
  saveProfile,
} from "@/lib/persistence/repository";

const key = "applylens.store";

describe("local profile repository", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips profile documents, evidence, blocks, and review states", () => {
    const profile = {
      ...sampleProfile,
      id: "real-profile-id",
      documents: [...sampleProfile.documents, { id: "project-1", title: "Project", kind: "project" as const, text: "A project source." }],
      evidence: [{ ...sampleProfile.evidence[0], reviewState: "edited" as const }],
    };
    saveProfile(profile);
    const restored = readStore();
    expect(restored.status).toBe("ok");
    expect(restored.store?.profile).toEqual({ ...profile, schemaVersion: SCHEMA_VERSION });
  });

  it("migrates version-one storage without losing saved reports", () => {
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, profile: { ...sampleProfile, id: "real-profile-id", schemaVersion: 1 }, analyses: [sampleAnalysis] }));
    const restored = readStore();
    expect(restored.status).toBe("migrated");
    expect(restored.store?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.store?.profile?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.store?.analyses).toHaveLength(1);
  });

  it("does not overwrite a future schema version", () => {
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, analyses: [] }));
    expect(readStore().status).toBe("future_version");
    expect(() => saveAnalysis(sampleAnalysis)).toThrow(PersistenceError);
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}").schemaVersion).toBe(SCHEMA_VERSION + 1);
  });

  it("reports a localStorage write failure", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(() => saveProfile(sampleProfile)).toThrow(PersistenceError);
    setItem.mockRestore();
  });
});
