import { z } from "zod";
import { SCHEMA_VERSION } from "@/domain/types";
import type { AppStore } from "@/domain/types";
import { parseAppStore } from "@/lib/persistence/repository";

export const backupFormat = "applylens-backup";
export const backupVersion = 1;
export const maxBackupBytes = 5 * 1024 * 1024;

const envelopeSchema = z.object({
  format: z.string(),
  backupVersion: z.number().int(),
  exportedAt: z.string().datetime(),
  appSchemaVersion: z.number().int(),
  data: z.unknown(),
});

export type ApplyLensBackup = {
  format: typeof backupFormat;
  backupVersion: typeof backupVersion;
  exportedAt: string;
  appSchemaVersion: number;
  data: AppStore;
};

export type BackupPreview = {
  hasProfile: boolean;
  profileName?: string;
  analyses: number;
  applications: number;
  exportedAt: string;
};

export type BackupImportResult =
  | { ok: true; backup: ApplyLensBackup; preview: BackupPreview }
  | { ok: false; code: "invalid_json" | "invalid_format" | "future_version" | "incompatible_data" };

export function validateBackupFile(name: string, size: number) {
  if (!name.toLowerCase().endsWith(".json")) return "invalid_format" as const;
  if (size > maxBackupBytes) return "file_too_large" as const;
  return undefined;
}

function exportableStore(store: AppStore): AppStore {
  const analyses = store.analyses.filter((analysis) => !analysis.isSample);
  const analysisIds = new Set(analyses.map((analysis) => analysis.id));
  return {
    ...store,
    profile: store.profile?.id === "sample-profile" ? undefined : store.profile,
    analyses,
    trackedApplications: store.trackedApplications.filter((item) => analysisIds.has(item.analysisId)),
  };
}

export function createBackup(store: AppStore, exportedAt = new Date().toISOString()): ApplyLensBackup {
  return {
    format: backupFormat,
    backupVersion,
    exportedAt,
    appSchemaVersion: SCHEMA_VERSION,
    data: exportableStore(store),
  };
}

export function backupFilename(exportedAt: string) {
  return `applylens-backup-${exportedAt.slice(0, 10)}.json`;
}

export function prepareBackupImport(text: string): BackupImportResult {
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, code: "invalid_json" };
  }

  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success || envelope.data.format !== backupFormat || envelope.data.backupVersion !== backupVersion) {
    return { ok: false, code: "invalid_format" };
  }
  if (envelope.data.appSchemaVersion > SCHEMA_VERSION) return { ok: false, code: "future_version" };

  const parsedStore = parseAppStore(envelope.data.data);
  if (parsedStore.status === "future_version") return { ok: false, code: "future_version" };
  if (!parsedStore.store || parsedStore.status === "invalid") return { ok: false, code: "incompatible_data" };

  const data = parsedStore.store;
  return {
    ok: true,
    backup: { ...envelope.data, format: backupFormat, backupVersion, data },
    preview: {
      hasProfile: Boolean(data.profile),
      profileName: data.profile?.displayName,
      analyses: data.analyses.length,
      applications: data.trackedApplications.length,
      exportedAt: envelope.data.exportedAt,
    },
  };
}
