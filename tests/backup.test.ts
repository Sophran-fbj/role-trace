// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/domain/types";
import { sampleAnalysis, sampleProfile } from "@/fixtures/sample";
import {
  backupFilename,
  createBackup,
  maxBackupBytes,
  prepareBackupImport,
  validateBackupFile,
} from "@/lib/persistence/backup";
import { readStore, replaceStore, saveAnalysis, saveProfile, storageKey, updateTrackedApplication } from "@/lib/persistence/repository";

function populatedStore() {
  const profile = { ...sampleProfile, id: "real-profile-backup", schemaVersion: SCHEMA_VERSION };
  const analysis = { ...sampleAnalysis, id: "analysis-backup", isSample: false, profileSnapshot: { ...sampleAnalysis.profileSnapshot, id: profile.id } };
  saveProfile(profile);
  const tracked = saveAnalysis(analysis);
  updateTrackedApplication(tracked.id, {
    status: "applied",
    jobUrl: "https://example.com/jobs/frontend",
    notes: "Applied directly",
  });
  updateTrackedApplication(tracked.id, {
    status: "interview",
    jobUrl: "https://example.com/jobs/frontend",
    notes: "Technical interview booked",
  });
  return readStore().store!;
}

describe("local data backup and restore", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips profile, analyses, application status, notes, and appliedAt", () => {
    const source = populatedStore();
    const backup = createBackup(source, "2026-09-08T12:00:00.000Z");
    const restored = prepareBackupImport(JSON.stringify(backup));

    expect(restored).toMatchObject({ ok: true, preview: { analyses: 1, applications: 1, exportedAt: backup.exportedAt } });
    if (!restored.ok) throw new Error("Expected a valid backup");
    window.localStorage.clear();
    replaceStore(restored.backup.data);
    expect(readStore().store).toEqual(source);
    expect(readStore().store?.trackedApplications[0]).toMatchObject({ status: "interview", notes: "Technical interview booked", appliedAt: expect.any(String) });
  });

  it("rejects invalid JSON without changing existing browser data", () => {
    const source = populatedStore();
    const before = window.localStorage.getItem(storageKey);

    expect(prepareBackupImport("{not json")).toEqual({ ok: false, code: "invalid_json" });
    expect(window.localStorage.getItem(storageKey)).toBe(before);
    expect(readStore().store).toEqual(source);
  });

  it("rejects the wrong backup format and future schema versions", () => {
    const backup = createBackup(populatedStore(), "2026-09-08T12:00:00.000Z");
    expect(prepareBackupImport(JSON.stringify({ ...backup, format: "other-backup" }))).toEqual({ ok: false, code: "invalid_format" });
    expect(prepareBackupImport(JSON.stringify({ ...backup, appSchemaVersion: SCHEMA_VERSION + 1 }))).toEqual({ ok: false, code: "future_version" });
    expect(prepareBackupImport(JSON.stringify({ ...backup, data: { ...backup.data, schemaVersion: SCHEMA_VERSION + 1 } }))).toEqual({ ok: false, code: "future_version" });
  });

  it("accepts a legacy ApplyLens backup through the shared store migration", () => {
    const source = populatedStore();
    const legacy = {
      schemaVersion: 2,
      profile: { ...source.profile!, schemaVersion: 2 },
      analyses: source.analyses,
    };
    const result = prepareBackupImport(JSON.stringify({
      format: "applylens-backup",
      backupVersion: 1,
      exportedAt: "2026-09-08T12:00:00.000Z",
      appSchemaVersion: 2,
      data: legacy,
    }));

    expect(result).toMatchObject({ ok: true, preview: { applications: 1 } });
    if (!result.ok) throw new Error("Expected a migrated backup");
    expect(result.backup.data.trackedApplications).toEqual([
      expect.objectContaining({ analysisId: source.analyses[0].id, status: "saved" }),
    ]);
  });

  it("enforces the JSON extension and 5MB file limit", () => {
    expect(validateBackupFile("backup.txt", 1)).toBe("invalid_format");
    expect(validateBackupFile("backup.json", maxBackupBytes + 1)).toBe("file_too_large");
    expect(validateBackupFile("backup.json", maxBackupBytes)).toBeUndefined();
  });

  it("exports only the AppStore payload and excludes sample fixtures and credentials", () => {
    const backup = createBackup({
      ...populatedStore(),
      profile: sampleProfile,
      analyses: [sampleAnalysis],
      trackedApplications: [{ id: "tracking-sample", analysisId: sampleAnalysis.id, status: "saved", createdAt: sampleAnalysis.createdAt, updatedAt: sampleAnalysis.createdAt }],
    }, "2026-09-08T12:00:00.000Z");
    const text = JSON.stringify(backup);

    expect(backup.data.profile).toBeUndefined();
    expect(backup.data.analyses).toEqual([]);
    expect(backup.data.trackedApplications).toEqual([]);
    expect(text).not.toContain("OPENAI_API_KEY");
    expect(text).not.toContain("DEEPSEEK_API_KEY");
    expect(backup.format).toBe("roletrace-backup");
    expect(backupFilename(backup.exportedAt)).toBe("roletrace-backup-2026-09-08.json");
  });
});
