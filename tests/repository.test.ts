// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/domain/types";
import { sampleAnalysis, sampleProfile } from "@/fixtures/sample";
import {
  PersistenceError,
  clearLocalData,
  readStore,
  saveAnalysis,
  saveProfile,
  updateTrackedApplication,
  filterTrackedApplications,
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
    expect(restored.store?.trackedApplications).toEqual([
      expect.objectContaining({ analysisId: sampleAnalysis.id, status: "saved" }),
    ]);
  });

  it("migrates version-two storage idempotently without duplicate tracking records", () => {
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, profile: { ...sampleProfile, id: "real-profile-id", schemaVersion: 2 }, analyses: [sampleAnalysis] }));
    const first = readStore();
    const second = readStore();
    expect(first.store?.trackedApplications).toEqual(second.store?.trackedApplications);
    expect(first.store?.trackedApplications).toHaveLength(1);
  });

  it("creates one saved tracking record for a new analysis and preserves appliedAt", () => {
    const tracked = saveAnalysis(sampleAnalysis);
    expect(tracked.status).toBe("saved");
    const applied = updateTrackedApplication(tracked.id, { status: "applied", jobUrl: "https://example.com/job", notes: "Applied directly" });
    const moved = updateTrackedApplication(tracked.id, { status: "interview", jobUrl: "https://example.com/job", notes: "Screen booked" });
    expect(applied.appliedAt).toBeTruthy();
    expect(moved.appliedAt).toBe(applied.appliedAt);
    expect(readStore().store?.trackedApplications[0]).toMatchObject({ status: "interview", notes: "Screen booked" });
  });

  it("keeps an existing analysis snapshot immutable while reusing its tracking record", () => {
    const tracked = saveAnalysis(sampleAnalysis);
    const replacement = saveAnalysis({ ...sampleAnalysis, recommendation: "skip" });

    expect(replacement.id).toBe(tracked.id);
    expect(readStore().store?.analyses).toEqual([sampleAnalysis]);
  });

  it("filters records by application status", () => {
    const first = saveAnalysis(sampleAnalysis);
    const second = saveAnalysis({ ...sampleAnalysis, id: "analysis-second" });
    updateTrackedApplication(second.id, { status: "interview", jobUrl: "", notes: "" });
    expect(filterTrackedApplications(readStore().store?.trackedApplications ?? [], "saved").map((item) => item.id)).toEqual([first.id]);
    expect(filterTrackedApplications(readStore().store?.trackedApplications ?? [], "interview").map((item) => item.id)).toEqual([second.id]);
  });

  it("clears profiles, analyses, and tracked applications together", () => {
    saveProfile(sampleProfile);
    saveAnalysis(sampleAnalysis);

    clearLocalData();

    expect(readStore().store).toEqual({
      schemaVersion: SCHEMA_VERSION,
      analyses: [],
      trackedApplications: [],
    });
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
