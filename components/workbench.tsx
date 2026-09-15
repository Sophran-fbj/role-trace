"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sampleAnalysis,
  sampleAnalysisForLanguage,
  sampleProfile,
  sampleProfileForLanguage,
} from "@/fixtures/sample";
import {
  SCHEMA_VERSION,
} from "@/domain/types";
import type {
  Analysis,
  CandidateProfile,
  EvidenceStrength,
  EvidenceItem,
  EvidenceType,
  MatchStatus,
  ReviewState,
  SourceBlock,
  SourceDocument,
  TrackedApplication,
  ApplicationStatus,
} from "@/domain/types";
import {
  browserDefaultLanguage,
  dateLocale,
  getCopy,
  legacyLanguageStorageKey,
  languageStorageKey,
  outputLanguageSchema,
  type OutputLanguage,
} from "@/lib/i18n";
import {
  clearLocalData,
  PersistenceError,
  readStore,
  saveAnalysis,
  saveProfile,
  updateTrackedApplication,
  filterTrackedApplications,
  replaceStore,
} from "@/lib/persistence/repository";
import { SOURCE_LIMITS } from "@/lib/validation/source-documents";
import {
  backupFilename,
  createBackup,
  prepareBackupImport,
  validateBackupFile,
} from "@/lib/persistence/backup";
import type { RoleTraceBackup, BackupPreview } from "@/lib/persistence/backup";

type View = "home" | "profile" | "analyze" | "report" | "saved";
type ProfileMode = "none" | "sample" | "real";
type ProjectDraft = { id: string; title: string; text: string };
const evidenceTypes: EvidenceType[] = ["production_experience", "project_experience", "work_responsibility", "measurable_outcome", "domain_experience", "education_or_certification", "constraint_fact", "self_asserted_skill", "other"];
const evidenceStrengths: EvidenceStrength[] = ["direct", "transferable", "weak"];
const applicationStatuses: ApplicationStatus[] = ["saved", "applied", "interview", "rejected", "offer"];
const reportFilters = ["all", "core", "gaps", "conflicts"] as const;
type ReportFilter = (typeof reportFilters)[number];

export function Workbench({ realAiEnabled = false }: { realAiEnabled?: boolean }) {
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("en");
  const copy = getCopy(outputLanguage);
  const [view, setView] = useState<View>("home");
  const [analysis, setAnalysis] = useState<Analysis>(sampleAnalysis);
  const [drawerId, setDrawerId] = useState<string>();
  const [resume, setResume] = useState("");
  const [projects, setProjects] = useState<ProjectDraft[]>([]);
  const [profileEvidence, setProfileEvidence] = useState<EvidenceItem[]>([]);
  const [sourceBlocks, setSourceBlocks] = useState<SourceBlock[]>([]);
  const [profileMode, setProfileMode] = useState<ProfileMode>("none");
  const [profileId, setProfileId] = useState<string>();
  const [profileCreatedAt, setProfileCreatedAt] = useState<string>();
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string>();
  const [extracting, setExtracting] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [profileSuccess, setProfileSuccess] = useState<string>();
  const [profileDirty, setProfileDirty] = useState(false);
  const [evidenceReviewDirty, setEvidenceReviewDirty] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jdText, setJdText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>();
  const [analysisNotice, setAnalysisNotice] = useState<string>();
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState<ReviewState | "all">(
    "all",
  );
  const [savedAnalyses, setSavedAnalyses] = useState<Analysis[]>([]);
  const [trackedApplications, setTrackedApplications] = useState<TrackedApplication[]>([]);
  const [applicationFilter, setApplicationFilter] = useState<ApplicationStatus | "all">("all");
  const [saved, setSaved] = useState(false);
  const [editingEvidenceId, setEditingEvidenceId] = useState<string>();
  const [evidenceDraft, setEvidenceDraft] = useState<Pick<EvidenceItem, "claim" | "type" | "strength">>();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<RoleTraceBackup>();
  const [backupPreview, setBackupPreview] = useState<BackupPreview>();
  const [backupError, setBackupError] = useState<string>();
  const [backupSuccess, setBackupSuccess] = useState<string>();
  const [importingBackup, setImportingBackup] = useState(false);
  const analysisAbortRef = useRef<AbortController | undefined>(undefined);
  const analysisTimerRef = useRef<number | undefined>(undefined);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerOpenerRef = useRef<HTMLButtonElement | undefined>(undefined);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const currentLanguage = window.localStorage.getItem(languageStorageKey);
      const storedLanguage = outputLanguageSchema.safeParse(
        currentLanguage ?? window.localStorage.getItem(legacyLanguageStorageKey),
      );
      const nextLanguage = storedLanguage.success
        ? storedLanguage.data
        : browserDefaultLanguage(window.navigator.language);
      if (!currentLanguage && storedLanguage.success) {
        try {
          window.localStorage.setItem(languageStorageKey, storedLanguage.data);
        } catch {
          // Language migration is optional and must not block restoring data.
        }
      }
      setOutputLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;

      const restored = readStore();
      const restoredCopy = getCopy(nextLanguage);
      if (restored.status === "migration_failed") {
        setProfileError(restoredCopy.errors.storageWrite);
      }
      if (!restored.store) {
        setProfileError(
          restored.status === "future_version"
            ? restoredCopy.errors.storageFuture
            : restored.status === "invalid"
              ? restoredCopy.errors.storageInvalid
              : restored.status === "migration_failed"
                ? restoredCopy.errors.storageWrite
              : undefined,
        );
      } else {
        const profile = restored.store.profile;
        if (profile) {
          setResume(profile.documents.find((item) => item.kind === "resume")?.text ?? "");
          setProjects(profile.documents.filter((item) => item.kind === "project").map((item) => ({ id: item.id, title: item.title, text: item.text })));
          setProfileEvidence(profile.evidence);
          setSourceBlocks(profile.sourceBlocks);
          setProfileId(profile.id);
          setProfileCreatedAt(profile.createdAt);
          setProfileUpdatedAt(profile.updatedAt);
          setProfileMode(profile.id === sampleProfile.id ? "sample" : "real");
        }
        setSavedAnalyses(restored.store.analyses);
        setTrackedApplications(restored.store.trackedApplications);
      }
      setAnalysis(sampleAnalysisForLanguage(nextLanguage));
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!drawerId) return;
    drawerCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerId(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [drawerId]);

  useEffect(() => {
    if (drawerId) return;
    drawerOpenerRef.current?.focus();
  }, [drawerId]);

  const selected = useMemo(
    () => analysis.matches.find((item) => item.requirementId === drawerId),
    [analysis, drawerId],
  );
  const requirement = analysis.requirements.find(
    (item) => item.id === selected?.requirementId,
  );
  const linkedEvidence = selected?.links.flatMap((link) => {
    const item = analysis.profileSnapshot.evidence.find(
      (candidate) => candidate.id === link.evidenceId,
    );
    return item ? [{ item, relationship: link.relationship }] : [];
  }) ?? [];
  const visibleEvidence = profileEvidence.filter(
    (item) => evidenceFilter === "all" || item.reviewState === evidenceFilter,
  );
  const reviewedEvidence = profileEvidence.filter(
    (item) => item.reviewState === "verified" || item.reviewState === "edited",
  ).length;
  const usableEvidence = profileEvidence.filter((item) => item.reviewState !== "excluded");
  const documents = useMemo<SourceDocument[]>(
    () => [
      ...(resume.trim()
        ? [{ id: "resume", title: copy.profile.resumeText, kind: "resume" as const, text: resume }]
        : []),
      ...projects.filter((project) => project.title.trim() && project.text.trim()).map((project) => ({ id: project.id, title: project.title.trim(), kind: "project" as const, text: project.text })),
    ],
    [copy.profile.resumeText, projects, resume],
  );
  const incompleteProjects = projects.some(
    (project) => Boolean(project.title.trim()) !== Boolean(project.text.trim()),
  );
  const projectCharacters = projects.reduce((sum, project) => sum + project.text.length, 0);
  const oversizedProjects = projects.some((project) => project.text.length > SOURCE_LIMITS.projectCharacters);
  const totalProjectsTooLong = projectCharacters > SOURCE_LIMITS.totalProjectCharacters;
  const projectInputError = incompleteProjects
    ? copy.profile.incompleteProject
    : oversizedProjects
      ? copy.profile.projectTooLong
      : totalProjectsTooLong
        ? copy.profile.projectsTooLong
      : undefined;
  const profileSaveDisabledReason = profileDirty
    ? copy.profile.saveHintDirty
    : projectInputError
      ? projectInputError
    : !documents.length
      ? copy.profile.addResumeFirst
      : !usableEvidence.length
        ? copy.profile.saveHintNoEvidence
        : undefined;
  const analysisDisabledReason = analyzing
    ? copy.analyze.waiting(analysisElapsedSeconds)
    : !realAiEnabled
      ? copy.analyze.realAiDisabled
    : profileMode !== "real" || !profileId || !profileUpdatedAt
      ? copy.analyze.createProfileFirst
    : profileDirty
      ? copy.analyze.disabledDirty
      : evidenceReviewDirty
        ? copy.analyze.disabledReviewDirty
        : !usableEvidence.length
          ? copy.analyze.disabledNoEvidence
          : !jdText.trim()
            ? copy.analyze.disabledJobDescription
            : jdText.trim().length < 100
              ? copy.analyze.disabledShortJobDescription
              : undefined;

  const ensureRealProfile = () => {
    const id = profileId && profileMode === "real" ? profileId : crypto.randomUUID();
    const createdAt = profileCreatedAt && profileMode === "real" ? profileCreatedAt : new Date().toISOString();
    setProfileId(id);
    setProfileCreatedAt(createdAt);
    setProfileMode("real");
    return { id, createdAt };
  };

  const profileSnapshot = (): CandidateProfile => {
    const identity = ensureRealProfile();
    return {
      id: identity.id,
      documents,
      sourceBlocks,
      evidence: profileEvidence,
      createdAt: identity.createdAt,
      updatedAt: profileUpdatedAt ?? new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    };
  };

  const activeTracking = analysis.isSample
    ? undefined
    : trackedApplications.find((item) => item.analysisId === analysis.id);
  const visibleApplications = filterTrackedApplications(
    trackedApplications,
    applicationFilter,
  );
  const hasExportableData = Boolean(profileUpdatedAt || savedAnalyses.length);

  const saveTracking = (
    id: string,
    changes: Pick<TrackedApplication, "status" | "jobUrl" | "notes">,
  ) => {
    try {
      const updated = updateTrackedApplication(id, changes);
      setTrackedApplications((items) =>
        items.map((item) => (item.id === id ? updated : item)),
      );
      return updated;
    } catch (error) {
      setAnalysisError(
        error instanceof PersistenceError ? copy.errors.storageWrite : error instanceof Error ? error.message : copy.errors.storageWrite,
      );
      return undefined;
    }
  };

  const backupErrorMessage = (code: "invalid_json" | "invalid_format" | "future_version" | "incompatible_data" | "file_too_large") => {
    switch (code) {
      case "invalid_json": return copy.errors.backupInvalidJson;
      case "invalid_format": return copy.errors.backupInvalidFormat;
      case "future_version": return copy.errors.backupFutureVersion;
      case "file_too_large": return copy.errors.backupTooLarge;
      default: return copy.errors.backupIncompatibleData;
    }
  };

  const exportLocalData = () => {
    setBackupError(undefined);
    setBackupSuccess(undefined);
    const restored = readStore();
    if (!restored.store) {
      setBackupError(restored.status === "future_version" ? copy.errors.backupFutureVersion : copy.errors.backupIncompatibleData);
      return;
    }
    const backup = createBackup(restored.store);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFilename(backup.exportedAt);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupSuccess(copy.saved.exportSuccess);
  };

  const stageBackupImport = async (file: File) => {
    setBackupError(undefined);
    setBackupSuccess(undefined);
    setImportingBackup(true);
    const fileIssue = validateBackupFile(file.name, file.size);
    if (fileIssue) {
      setBackupError(backupErrorMessage(fileIssue));
      setImportingBackup(false);
      return;
    }
    let result: ReturnType<typeof prepareBackupImport>;
    try {
      result = prepareBackupImport(await file.text());
    } catch {
      setBackupError(copy.errors.backupInvalidJson);
      setImportingBackup(false);
      return;
    }
    if (!result.ok) {
      setBackupError(backupErrorMessage(result.code));
      setImportingBackup(false);
      return;
    }
    setPendingBackup(result.backup);
    setBackupPreview(result.preview);
    setImportingBackup(false);
  };

  const confirmBackupImport = () => {
    if (!pendingBackup) return;
    try {
      const restored = replaceStore(pendingBackup.data);
      const profile = restored.profile;
      setResume(profile?.documents.find((item) => item.kind === "resume")?.text ?? "");
      setProjects(profile?.documents.filter((item) => item.kind === "project").map((item) => ({ id: item.id, title: item.title, text: item.text })) ?? []);
      setProfileEvidence(profile?.evidence ?? []);
      setSourceBlocks(profile?.sourceBlocks ?? []);
      setProfileId(profile?.id);
      setProfileCreatedAt(profile?.createdAt);
      setProfileUpdatedAt(profile?.updatedAt);
      setProfileMode(profile ? "real" : "none");
      setProfileDirty(false);
      setSaved(false);
      setSavedAnalyses(restored.analyses);
      setTrackedApplications(restored.trackedApplications);
      setAnalysis(restored.analyses[0] ?? sampleAnalysisForLanguage(outputLanguage));
      setDrawerId(undefined);
      setPendingBackup(undefined);
      setBackupPreview(undefined);
      setBackupSuccess(copy.saved.importSuccess);
      setView("saved");
    } catch {
      setBackupError(copy.errors.storageWrite);
    }
  };

  const changeLanguage = (nextLanguage: OutputLanguage) => {
    window.localStorage.setItem(languageStorageKey, nextLanguage);
    document.documentElement.lang = nextLanguage;
    setOutputLanguage(nextLanguage);
    if (profileMode === "sample") {
      const localizedProfile = sampleProfileForLanguage(nextLanguage);
      setResume(localizedProfile.documents[0].text);
      setProjects(localizedProfile.documents.filter((item) => item.kind === "project").map((item) => ({ id: item.id, title: item.title, text: item.text })));
      setProfileEvidence(localizedProfile.evidence);
      setSourceBlocks(localizedProfile.sourceBlocks);
    }
    if (analysis.isSample) setAnalysis(sampleAnalysisForLanguage(nextLanguage));
    setSavedAnalyses((items) =>
      items.map((item) =>
        item.isSample ? sampleAnalysisForLanguage(nextLanguage) : item,
      ),
    );
  };

  const trySample = () => {
    const localizedProfile = sampleProfileForLanguage(outputLanguage);
    const localizedAnalysis = sampleAnalysisForLanguage(outputLanguage);
    setResume(localizedProfile.documents[0].text);
    setProjects(localizedProfile.documents.filter((item) => item.kind === "project").map((item) => ({ id: item.id, title: item.title, text: item.text })));
    setProfileEvidence(localizedProfile.evidence);
    setSourceBlocks(localizedProfile.sourceBlocks);
    setProfileId(localizedProfile.id);
    setProfileCreatedAt(localizedProfile.createdAt);
    setProfileMode("sample");
    setProfileDirty(false);
    setEvidenceReviewDirty(false);
    setAnalysis(localizedAnalysis);
    setView("report");
  };

  const updateEvidenceState = (
    id: string,
    reviewState: EvidenceItem["reviewState"],
  ) => {
    setProfileEvidence((items) =>
      items.map((item) => (item.id === id ? { ...item, reviewState } : item)),
    );
    setEvidenceReviewDirty(true);
    setProfileSuccess(undefined);
  };

  const beginEvidenceEdit = (item: EvidenceItem) => {
    setEditingEvidenceId(item.id);
    setEvidenceDraft({ claim: item.claim, type: item.type, strength: item.strength });
  };

  const saveEvidenceEdit = (id: string) => {
    if (!evidenceDraft?.claim.trim()) return;
    setProfileEvidence((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, ...evidenceDraft, claim: evidenceDraft.claim.trim(), reviewState: "edited" }
          : item,
      ),
    );
    setEvidenceReviewDirty(true);
    setProfileSuccess(undefined);
    setEditingEvidenceId(undefined);
    setEvidenceDraft(undefined);
  };

  const extractProfileEvidence = async () => {
    if (!realAiEnabled) {
      setProfileError(copy.profile.realAiDisabled);
      return;
    }
    setExtracting(true);
    setProfileError(undefined);
    setProfileSuccess(undefined);
    try {
      if (projectInputError) throw new Error(projectInputError);
      if (!documents.length) throw new Error(copy.profile.addResumeFirst);
      const response = await fetch("/api/evidence/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RoleTrace-Language": outputLanguage },
        body: JSON.stringify({
          documents,
          outputLanguage,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { evidence: EvidenceItem[]; sourceBlocks: SourceBlock[] };
        error?: { message: string };
      };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? copy.errors.extract);
      }
      setProfileEvidence(payload.data.evidence);
      setSourceBlocks(payload.data.sourceBlocks);
      setProfileDirty(false);
      setEvidenceReviewDirty(true);
      ensureRealProfile();
      setProfileSuccess(copy.profile.extracted);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : copy.errors.extract,
      );
    } finally {
      setExtracting(false);
    }
  };

  const analyzeRealJob = async () => {
    if (analyzing || analysisDisabledReason) return;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalyzing(true);
    setAnalysisError(undefined);
    setAnalysisNotice(undefined);
    setAnalysisElapsedSeconds(0);
    const startedAt = Date.now();
    analysisTimerRef.current = window.setInterval(() => {
      setAnalysisElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RoleTrace-Language": outputLanguage },
        body: JSON.stringify({
          job: {
            id: crypto.randomUUID(),
            title: jobTitle || undefined,
            company: company || undefined,
            rawText: jdText,
            createdAt: new Date().toISOString(),
          },
          profile: profileSnapshot(),
          verifiedOnly,
          outputLanguage,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: Analysis;
        error?: { message: string };
      };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? copy.errors.analyze);
      }
      const completedAnalysis = payload.data;
      const tracked = saveAnalysis(completedAnalysis);
      setSavedAnalyses((items) => [
        completedAnalysis,
        ...items.filter((item) => item.id !== completedAnalysis.id),
      ]);
      setTrackedApplications((items) => [
        tracked,
        ...items.filter((item) => item.analysisId !== completedAnalysis.id),
      ]);
      setAnalysis(completedAnalysis);
      setView("report");
    } catch (error) {
      if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
        setAnalysisNotice(copy.analyze.cancelled);
      } else {
        setAnalysisError(
          error instanceof Error ? error.message : copy.errors.analyze,
        );
      }
    } finally {
      if (analysisTimerRef.current) window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = undefined;
      analysisAbortRef.current = undefined;
      setAnalysisElapsedSeconds(0);
      setAnalyzing(false);
    }
  };

  const cancelAnalysis = () => analysisAbortRef.current?.abort();

  const openDrawer = (requirementId: string, trigger: HTMLButtonElement) => {
    drawerOpenerRef.current = trigger;
    setDrawerId(requirementId);
  };

  return (
    <main lang={outputLanguage}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")}>
          Role<span>Trace</span>
        </button>
        <nav>
          <button className="nav-button" onClick={() => setView("profile")}>{copy.nav.profile}</button>
          <button className="nav-button" onClick={() => setView("analyze")}>{copy.nav.analyze}</button>
          <button className="nav-button" onClick={() => setView("saved")}>{copy.nav.saved}</button>
        </nav>
        <div className="language-toggle">
          <button
            aria-pressed={outputLanguage === "zh-CN"}
            className={`language-button ${outputLanguage === "zh-CN" ? "active" : ""}`}
            onClick={() => changeLanguage("zh-CN")}
          >
            {copy.language.chinese}
          </button>
          <button
            aria-pressed={outputLanguage === "en"}
            className={`language-button ${outputLanguage === "en" ? "active" : ""}`}
            onClick={() => changeLanguage("en")}
          >
            {copy.language.english}
          </button>
        </div>
        <button
          className="quiet"
          onClick={() => {
            if (!window.confirm(copy.errors.confirmDeleteLocalData)) return;
            try {
              clearLocalData();
              setSaved(false);
              setSavedAnalyses([]);
              setTrackedApplications([]);
              setResume("");
              setProjects([]);
              setProfileEvidence([]);
              setSourceBlocks([]);
              setProfileId(undefined);
              setProfileCreatedAt(undefined);
              setProfileUpdatedAt(undefined);
              setProfileMode("none");
            } catch {
              setProfileError(copy.errors.storageWrite);
            }
          }}
        >
          {copy.nav.deleteLocalData}
        </button>
      </header>
      {profileError && view !== "profile" && <p className="global-feedback error" role="alert">{profileError}</p>}
      {analysisError && view !== "analyze" && <p className="global-feedback error" role="alert">{analysisError}</p>}

      {view === "home" && (
        <section className="hero">
          <p className="eyebrow">{copy.home.eyebrow}</p>
          <h1>{copy.home.title}</h1>
          <p className="lede">{copy.home.description}</p>
          {!realAiEnabled && <p className="notice" role="status">{copy.home.publicDemo}</p>}
          <div className="actions">
            {realAiEnabled ? (
              <>
                <button className="primary" onClick={() => setView("analyze")}>
                  {copy.home.analyze}
                </button>
                <button className="secondary" onClick={trySample}>
                  {copy.home.sample}
                </button>
              </>
            ) : (
              <button className="primary" onClick={trySample}>
                {copy.home.sample}
              </button>
            )}
          </div>
          <div className="trust">
            {copy.home.trust.map((item) => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
          <article className="preview">
            <p className="eyebrow">{copy.home.example}</p>
            <h3>{copy.home.exampleRequirement}</h3>
            <span className="pill strong_match">{copy.home.exampleStatus}</span>
            <p>“{copy.home.exampleQuote}”</p>
          </article>
        </section>
      )}

      {view === "profile" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">{copy.profile.eyebrow}</p>
            <h1>{copy.profile.title}</h1>
            <p>{copy.profile.description}</p>
          </div>
          {!realAiEnabled && (
            <div className="notice" role="status">
              <p>{copy.profile.realAiDisabled}</p>
              <button className="secondary" onClick={trySample}>
                {copy.profile.openSample}
              </button>
            </div>
          )}
          <label>
            {copy.profile.resumeText}
            <textarea
              value={resume}
              maxLength={SOURCE_LIMITS.resumeCharacters}
              onChange={(event) => {
                setResume(event.target.value);
                setProfileDirty(true);
                setProfileSuccess(undefined);
                setProfileMode("real");
                if (profileMode !== "real") {
                  setProfileId(undefined);
                  setProfileCreatedAt(undefined);
                }
                setSaved(false);
              }}
            />
          </label>
          <small>
            {resume.length.toLocaleString(dateLocale(outputLanguage))} / {SOURCE_LIMITS.resumeCharacters.toLocaleString(dateLocale(outputLanguage))}
          </small>
          <div className="section-title">
            <h2>{copy.profile.projects}</h2>
            <button
              className="link"
              disabled={projects.length >= SOURCE_LIMITS.projects}
              onClick={() => setProjects((items) => [...items, { id: crypto.randomUUID(), title: "", text: "" }])}
            >
              {copy.profile.addProject}
            </button>
          </div>
          {projects.length >= 5 && <p className="notice">{copy.profile.projectLimit}</p>}
          {projects.map((project, index) => (
            <article className="panel" key={project.id}>
              <label>
                {copy.profile.projectTitle(index + 1)}
                <input
                  value={project.title}
                  maxLength={120}
                  onChange={(event) => {
                    setProjects((items) => items.map((item) => item.id === project.id ? { ...item, title: event.target.value } : item));
                    setProfileDirty(true);
                    setProfileSuccess(undefined);
                    setSaved(false);
                  }}
                />
              </label>
              <label>
                {copy.profile.projectDescription}
              <textarea
                value={project.text}
                maxLength={SOURCE_LIMITS.projectCharacters}
                  onChange={(event) => {
                    setProjects((items) => items.map((item) => item.id === project.id ? { ...item, text: event.target.value } : item));
                    setProfileDirty(true);
                    setProfileSuccess(undefined);
                    setSaved(false);
                  }}
                />
              </label>
              <small>{project.text.length.toLocaleString(dateLocale(outputLanguage))} / {SOURCE_LIMITS.projectCharacters.toLocaleString(dateLocale(outputLanguage))}</small>
              <button className="link" onClick={() => { setProjects((items) => items.filter((item) => item.id !== project.id)); setProfileDirty(true); setProfileSuccess(undefined); setSaved(false); }}>
                {copy.profile.removeProject}
              </button>
            </article>
          ))}
          {projectInputError && <p className="error" role="alert">{projectInputError}</p>}
          <div className="row">
            {realAiEnabled ? (
              <button
                className="secondary"
                disabled={extracting || !resume.trim() || Boolean(projectInputError)}
                onClick={extractProfileEvidence}
              >
                {extracting ? copy.profile.extracting : copy.profile.extract}
              </button>
            ) : null}
            <button
              className="primary"
              disabled={Boolean(profileSaveDisabledReason)}
              onClick={() => {
                try {
                  if (!documents.length) throw new Error(copy.profile.addResumeFirst);
                  const snapshot = { ...profileSnapshot(), updatedAt: new Date().toISOString() };
                  saveProfile(snapshot);
                  setProfileUpdatedAt(snapshot.updatedAt);
                  setProfileDirty(false);
                  setEvidenceReviewDirty(false);
                  setSaved(true);
                  setProfileError(undefined);
                  setProfileSuccess(undefined);
                } catch (error) {
                  setProfileError(error instanceof PersistenceError ? copy.errors.storageWrite : error instanceof Error ? error.message : copy.errors.storageWrite);
                }
              }}
            >
              {copy.profile.save}
            </button>
            {saved && <span className="saved">{copy.profile.saved}</span>}
          </div>
          {profileSaveDisabledReason && <p className="notice">{profileSaveDisabledReason}</p>}
          {profileDirty && (
            <p className="error" role="alert">
              {copy.profile.dirty}
            </p>
          )}
          {profileError && (
            <p className="error" role="alert">
              {profileError}
            </p>
          )}
          {profileSuccess && <p className="saved" role="status">{profileSuccess}</p>}
          <div className="section-title">
            <h2>{copy.profile.evidenceReview}</h2>
            <div className="filters">
              {(["all", "pending", "verified", "edited", "excluded"] as const).map(
                (filter) => (
                  <button
                    className={
                      evidenceFilter === filter ? "filter active" : "filter"
                    }
                    aria-pressed={evidenceFilter === filter}
                    onClick={() => setEvidenceFilter(filter)}
                    key={filter}
                  >
                    {copy.reviewStates[filter]}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="cards">
            {visibleEvidence.length ? visibleEvidence.map((item) => (
              <article className="evidence" key={item.id}>
                <div>
                  <span className="pill neutral">
                    {copy.reviewStates[item.reviewState]}
                  </span>
                  <span className="pill neutral">
                    {copy.evidenceTypes[item.type]}
                  </span>
                </div>
                {editingEvidenceId === item.id && evidenceDraft ? (
                  <div className="evidence-editor">
                    <label>
                      {copy.profile.claim}
                      <input
                        value={evidenceDraft.claim}
                        onChange={(event) => setEvidenceDraft({ ...evidenceDraft, claim: event.target.value })}
                      />
                    </label>
                    <label>
                      {copy.profile.evidenceType}
                      <select
                        value={evidenceDraft.type}
                        onChange={(event) => setEvidenceDraft({ ...evidenceDraft, type: event.target.value as EvidenceType })}
                      >
                        {evidenceTypes.map((type) => <option key={type} value={type}>{copy.evidenceTypes[type]}</option>)}
                      </select>
                    </label>
                    <label>
                      {copy.profile.strength}
                      <select
                        value={evidenceDraft.strength}
                        onChange={(event) => setEvidenceDraft({ ...evidenceDraft, strength: event.target.value as EvidenceStrength })}
                      >
                        {evidenceStrengths.map((strength) => <option key={strength} value={strength}>{copy.evidenceStrengths[strength]}</option>)}
                      </select>
                    </label>
                    <label>
                      {copy.profile.exactQuote}
                      <textarea value={item.exactQuote} readOnly />
                    </label>
                    <label>
                      {copy.profile.sourceBlock}
                      <textarea value={sourceBlocks.find((block) => block.id === item.sourceBlockId)?.text ?? ""} readOnly />
                    </label>
                  </div>
                ) : (
                  <>
                    <h3>{item.claim}</h3>
                    <blockquote>“{item.exactQuote}”</blockquote>
                    <small>{documents.find((document) => document.id === sourceBlocks.find((block) => block.id === item.sourceBlockId)?.documentId)?.title ?? copy.drawer.unknownDocument}</small>
                  </>
                )}
                <div className="evidence-actions">
                  <button
                    className="link"
                    onClick={() => updateEvidenceState(item.id, "verified")}
                  >
                    {copy.profile.verify}
                  </button>
                  {editingEvidenceId === item.id ? (
                    <>
                      <button className="link" onClick={() => saveEvidenceEdit(item.id)}>{copy.profile.saveEdit}</button>
                      <button className="link" onClick={() => { setEditingEvidenceId(undefined); setEvidenceDraft(undefined); }}>{copy.profile.cancelEdit}</button>
                    </>
                  ) : (
                    <button className="link" onClick={() => beginEvidenceEdit(item)}>{copy.profile.edit}</button>
                  )}
                  <button
                    className="link"
                    onClick={() => updateEvidenceState(item.id, "excluded")}
                  >
                    {copy.profile.exclude}
                  </button>
                </div>
              </article>
            )) : <p className="notice">{copy.profile.noEvidence}</p>}
          </div>
        </section>
      )}

      {view === "analyze" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">{copy.analyze.eyebrow}</p>
            <h1>{copy.analyze.title}</h1>
            <p>{copy.analyze.description}</p>
          </div>
          {profileMode === "real" && profileUpdatedAt ? (
            <section className="panel profile-meta" aria-label={copy.analyze.eyebrow}>
              <p>{copy.analyze.profileUpdatedAt(new Date(profileUpdatedAt).toLocaleString(dateLocale(outputLanguage)))}</p>
              <p>{copy.analyze.sourceSummary(projects.filter((project) => project.title.trim() && project.text.trim()).length)}</p>
              <p>{copy.analyze.totalEvidence(profileEvidence.length)}</p>
              <p>{copy.analyze.reviewedEvidence(reviewedEvidence)}</p>
            </section>
          ) : (
            <p className="notice">{copy.analyze.createProfileFirst}</p>
          )}
          <div className="formgrid">
            <label>
              {copy.analyze.jobTitle}
              <input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </label>
            <label>
              {copy.analyze.company}
              <input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </label>
          </div>
          <label>
            {copy.analyze.jobDescription}
            <textarea
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              maxLength={20_000}
            />
          </label>
          <p className="small">{copy.analyze.jdCharacters(jdText.length.toLocaleString(dateLocale(outputLanguage)))}</p>
          <div className="analysis-bar">
            <label className="toggle">
              <input
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                type="checkbox"
              />
              {copy.analyze.verifiedOnly}
            </label>
            <span className="small">{copy.analyze.analysisMode(verifiedOnly)}</span>
            <button
              className="primary"
              disabled={Boolean(analysisDisabledReason)}
              onClick={analyzeRealJob}
            >
              {analyzing ? copy.analyze.submitting : copy.analyze.submit}
            </button>
            {analyzing && <button className="secondary" onClick={cancelAnalysis}>{copy.analyze.cancel}</button>}
          </div>
          {analyzing && <p className="notice" role="status">{copy.analyze.waiting(analysisElapsedSeconds)} {copy.analyze.expectedTime}</p>}
          {analysisDisabledReason && !analyzing && profileMode === "real" && realAiEnabled && <p className="notice">{analysisDisabledReason}</p>}
          {analysisError && (
            <p className="error" role="alert">
              {analysisError}
            </p>
          )}
          {analysisNotice && <p className="notice" role="status">{analysisNotice}</p>}
          {realAiEnabled && <p className="notice">{copy.analyze.notice}</p>}
        </section>
      )}

      {view === "report" && (
        <Report
          key={activeTracking?.id ?? analysis.id}
          analysis={
            analysis.isSample
              ? sampleAnalysisForLanguage(outputLanguage)
              : analysis
          }
          language={outputLanguage}
          onSource={openDrawer}
          tracking={activeTracking}
          onSaveTracking={saveTracking}
          currentProfileUpdatedAt={profileMode === "real" ? profileUpdatedAt : undefined}
          onReanalyze={() => setView("analyze")}
        />
      )}

      {view === "saved" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">{copy.saved.eyebrow}</p>
            <h1>{copy.saved.title}</h1>
          </div>
          <div className="actions">
            <button className="secondary" disabled={!hasExportableData} onClick={exportLocalData}>{copy.saved.exportData}</button>
            <button className="secondary" disabled={importingBackup} onClick={() => importInputRef.current?.click()}>{copy.saved.importData}</button>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              aria-label={copy.saved.importData}
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void stageBackupImport(file);
              }}
            />
          </div>
          {importingBackup && <p className="notice" role="status">{copy.saved.importing}</p>}
          {backupError && <p className="notice" role="alert">{backupError}</p>}
          {backupSuccess && <p className="saved" role="status">{backupSuccess}</p>}
          {pendingBackup && backupPreview && (
            <section className="panel">
              <p className="eyebrow">{copy.saved.importPreview}</p>
              <p>{copy.saved.importWarning}</p>
              <p>{copy.saved.importedProfile}: {backupPreview.profileName ?? (backupPreview.hasProfile ? copy.saved.profilePresent : copy.saved.noProfile)}</p>
              <p>{copy.saved.reports(backupPreview.analyses)} · {copy.saved.applications(backupPreview.applications)}</p>
              <p>{copy.saved.exportedAt}: {new Date(backupPreview.exportedAt).toLocaleString(dateLocale(outputLanguage))}</p>
              <div className="actions">
                <button className="primary" onClick={confirmBackupImport}>{copy.saved.confirmImport}</button>
                <button className="secondary" onClick={() => { setPendingBackup(undefined); setBackupPreview(undefined); }}>{copy.saved.cancelImport}</button>
              </div>
            </section>
          )}
          <section className="status-filter" aria-label={copy.saved.filter}>
            <p className="field-label">{copy.saved.filter}</p>
            <div className="filters">
              <button className={applicationFilter === "all" ? "filter active" : "filter"} aria-pressed={applicationFilter === "all"} onClick={() => setApplicationFilter("all")}>{copy.reviewStates.all}</button>
              {applicationStatuses.map((status) => <button key={status} className={applicationFilter === status ? "filter active" : "filter"} aria-pressed={applicationFilter === status} onClick={() => setApplicationFilter(status)}>{copy.applicationStatuses[status]}</button>)}
            </div>
          </section>
          <div className="matrix">
            {visibleApplications.length ? (
              visibleApplications.map((tracked) => {
                const item = savedAnalyses.find((candidate) => candidate.id === tracked.analysisId);
                if (!item) return null;
                return (
                <article className="requirement" key={tracked.id}>
                  <div>
                    <h3>{item.job.title ?? copy.saved.untitledJob}</h3>
                    <p>
                      {item.job.company ?? copy.saved.unspecifiedCompany} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString(
                        dateLocale(outputLanguage),
                      )}
                    </p>
                    <p>{copy.recommendations[item.recommendation]} · {copy.applicationStatuses[tracked.status]}</p>
                    <small>{copy.saved.savedAt}: {new Date(tracked.createdAt).toLocaleDateString(dateLocale(outputLanguage))} · {copy.saved.appliedAt}: {tracked.appliedAt ? new Date(tracked.appliedAt).toLocaleDateString(dateLocale(outputLanguage)) : "—"} · {copy.saved.updatedAt}: {new Date(tracked.updatedAt).toLocaleDateString(dateLocale(outputLanguage))}</small>
                  </div>
                  <label>
                    {copy.saved.applicationStatus}
                    <select value={tracked.status} onChange={(event) => saveTracking(tracked.id, { status: event.target.value as ApplicationStatus, jobUrl: tracked.jobUrl, notes: tracked.notes })}>
                      {applicationStatuses.map((status) => <option key={status} value={status}>{copy.applicationStatuses[status]}</option>)}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    onClick={() => {
                      setAnalysis(
                        item.isSample
                          ? sampleAnalysisForLanguage(outputLanguage)
                          : item,
                      );
                      setView("report");
                    }}
                  >
                    {copy.saved.open}
                  </button>
                </article>
                );
              })
            ) : (
              <p className="notice">{copy.saved.empty}</p>
            )}
          </div>
        </section>
      )}

      {selected && requirement && (
        <>
        <div className="drawer-backdrop" aria-hidden="true" />
        <aside
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={copy.drawer.ariaLabel}
        >
          <button ref={drawerCloseRef} className="close" aria-label={copy.drawer.close} onClick={() => setDrawerId(undefined)}>
            ×
          </button>
          <p className="eyebrow">{copy.drawer.sourceComparison}</p>
          <h2>{requirement.label}</h2>
          <div className="source-grid">
            <section>
              <small>{copy.drawer.jobDescription}</small>
              <blockquote>
                “
                {requirement.sources
                  .map((source) => source.exactQuote)
                  .join(" ")}
                ”
              </blockquote>
            </section>
            <section>
              <small>{copy.drawer.candidateEvidence}</small>
              {linkedEvidence.length ? (
                linkedEvidence.map(({ item, relationship }) => (
                  <article className="drawer-evidence" key={item.id}>
                    <p><strong>{copy.drawer.candidateClaim}</strong> {item.claim}</p>
                    <blockquote><strong>{copy.drawer.candidateQuote}</strong> “{item.exactQuote}”</blockquote>
                    <p><strong>{copy.drawer.sourceDocument}</strong> {analysis.profileSnapshot.documents.find((document) => document.id === analysis.profileSnapshot.sourceBlocks.find((block) => block.id === item.sourceBlockId)?.documentId)?.title ?? copy.drawer.unknownDocument}</p>
                    <dl>
                      <div><dt>{copy.drawer.evidenceType}</dt><dd>{copy.evidenceTypes[item.type]}</dd></div>
                      <div><dt>{copy.drawer.evidenceStrength}</dt><dd>{copy.evidenceStrengths[item.strength]}</dd></div>
                      <div><dt>{copy.drawer.reviewState}</dt><dd>{copy.reviewStates[item.reviewState]}</dd></div>
                      <div><dt>{copy.drawer.relationship}</dt><dd>{copy.drawer.relationships[relationship]}</dd></div>
                    </dl>
                  </article>
                ))
              ) : (
                <p>{copy.drawer.noEvidence}</p>
              )}
            </section>
          </div>
          <p>{selected.rationale ?? selected.gap}</p>
          <p className="small">{copy.drawer.snapshotNotice}</p>
        </aside>
        </>
      )}
    </main>
  );
}

function Report({
  analysis,
  language,
  onSource,
  tracking,
  onSaveTracking,
  currentProfileUpdatedAt,
  onReanalyze,
}: {
  analysis: Analysis;
  language: OutputLanguage;
  onSource: (id: string, trigger: HTMLButtonElement) => void;
  tracking?: TrackedApplication;
  onSaveTracking: (id: string, changes: Pick<TrackedApplication, "status" | "jobUrl" | "notes">) => TrackedApplication | undefined;
  currentProfileUpdatedAt?: string;
  onReanalyze: () => void;
}) {
  const copy = getCopy(language);
  const [jobUrl, setJobUrl] = useState(tracking?.jobUrl ?? "");
  const [notes, setNotes] = useState(tracking?.notes ?? "");
  const [jobUrlError, setJobUrlError] = useState<string>();
  const [matrixFilter, setMatrixFilter] = useState<ReportFilter>("all");
  const matchCounts = analysis.matches.reduce<Record<MatchStatus, number>>(
    (counts, match) => ({ ...counts, [match.status]: counts[match.status] + 1 }),
    { strong_match: 0, partial_match: 0, no_evidence_provided: 0, conflicting_evidence: 0, unknown: 0 },
  );
  const matrix = analysis.requirements.flatMap((requirement) => {
    const match = analysis.matches.find((item) => item.requirementId === requirement.id);
    return match ? [{ requirement, match }] : [];
  }).filter(({ requirement, match }) => (
    matrixFilter === "all"
      || (matrixFilter === "core" && requirement.priority === "core")
      || (matrixFilter === "gaps" && ["partial_match", "no_evidence_provided", "unknown"].includes(match.status))
      || (matrixFilter === "conflicts" && match.status === "conflicting_evidence")
  ));
  const confirmedConstraints = analysis.constraints.filter((item) => item.status === "confirmed");
  const unresolvedConstraints = analysis.constraints.filter((item) => item.status === "unresolved");
  const profileChanged = !analysis.isSample && Boolean(currentProfileUpdatedAt && currentProfileUpdatedAt !== analysis.profileUpdatedAt);
  const saveTrackingDetails = (status = tracking?.status) => {
    if (!tracking || !status) return;
    if (jobUrl.trim()) {
      try {
        const parsed = new URL(jobUrl.trim());
        if (!/^https?:$/.test(parsed.protocol)) throw new Error("Unsupported protocol");
      } catch {
        setJobUrlError(copy.report.invalidJobUrl);
        return;
      }
    }
    setJobUrlError(undefined);
    onSaveTracking(tracking.id, { status, jobUrl, notes });
  };
  return (
    <section className="page report">
      <div className="report-head">
        <div>
          <p className="eyebrow">
            {copy.report.heading} ·{" "}
            {analysis.isSample ? copy.report.sample : copy.report.analysis}
          </p>
          <h1>
            {analysis.job.title}{" "}
            <span>
              {copy.report.at} {analysis.job.company}
            </span>
          </h1>
          <p>
            {copy.report.generated(
              new Date(analysis.createdAt).toLocaleString(dateLocale(language)),
            )}
          </p>
        </div>
        <div className={`recommendation ${analysis.recommendation}`}>
          <small>{copy.report.recommendation}</small>
          <strong>{copy.recommendations[analysis.recommendation]}</strong>
        </div>
      </div>
      {profileChanged && (
        <section className="notice report-notice" role="status">
          {copy.report.profileChanged} <button className="link" onClick={onReanalyze}>{copy.report.reanalyze}</button>
        </section>
      )}
      {tracking && (
        <section className="panel tracking-panel">
          <label>
            {copy.report.applicationStatus}
            <select
              value={tracking.status}
              onChange={(event) => saveTrackingDetails(event.target.value as ApplicationStatus)}
            >
              {applicationStatuses.map((status) => (
                <option key={status} value={status}>{copy.applicationStatuses[status]}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.report.jobUrl}
            <input type="url" value={jobUrl} onChange={(event) => { setJobUrl(event.target.value); setJobUrlError(undefined); }} placeholder="https://" aria-describedby={jobUrlError ? "job-url-error" : undefined} />
          </label>
          {jobUrlError && <p id="job-url-error" className="error" role="alert">{jobUrlError}</p>}
          <label>
            {copy.report.notes}
            <textarea value={notes} maxLength={2_000} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="secondary" onClick={() => saveTrackingDetails()}>
            {copy.report.saveTracking}
          </button>
        </section>
      )}
      <div className="report-layout">
        <div>
          <section className="panel report-summary" aria-label={copy.report.summary}>
            <p className="eyebrow">{copy.report.summary}</p>
            <div className="summary-counts">
              {(["strong_match", "partial_match", "no_evidence_provided", "conflicting_evidence", "unknown"] as MatchStatus[]).map((status) => (
                <span key={status} className={`pill ${status}`}>{copy.matchStatuses[status]}: {matchCounts[status]}</span>
              ))}
            </div>
          </section>
          <section className="panel constraints">
            <p className="eyebrow">{copy.report.hardConstraints}</p>
            {confirmedConstraints.length ? confirmedConstraints.map((constraint) => {
              const label = analysis.requirements.find((item) => item.id === constraint.requirementId)?.label;
              return <p key={constraint.requirementId}><strong>{label}</strong>: {constraint.detail}</p>;
            }) : <p>{copy.report.noConstraints}</p>}
            {unresolvedConstraints.length > 0 && <>
              <p className="eyebrow">{copy.report.unresolvedConstraints}</p>
              {unresolvedConstraints.map((constraint) => {
                const label = analysis.requirements.find((item) => item.id === constraint.requirementId)?.label;
                return <p key={constraint.requirementId}><strong>{label}</strong>: {constraint.detail}</p>;
              })}
            </>}
          </section>
          <section className="panel">
            <h2>{copy.report.why}</h2>
            {analysis.reasons.map((reason) => (
              <p key={reason}>— {reason}</p>
            ))}
          </section>
          <section>
            <div className="section-title">
              <div>
                <p className="eyebrow">{copy.report.matrix}</p>
                <h2>{copy.report.supported}</h2>
              </div>
              <p className="small">{copy.report.noScore}</p>
            </div>
            <div className="filters" aria-label={copy.report.matrix}>
              {reportFilters.map((filter) => <button key={filter} className={matrixFilter === filter ? "filter active" : "filter"} aria-pressed={matrixFilter === filter} onClick={() => setMatrixFilter(filter)}>{copy.report.filters[filter]}</button>)}
            </div>
            <div className="matrix">
              {matrix.length ? matrix.map(({ requirement, match }) => {
                return (
                  <article key={requirement.id} className="requirement">
                    <div>
                      <span className="pill neutral">
                        {copy.priorities[requirement.priority]}
                      </span>
                      <h3>{requirement.label}</h3>
                      <p>{match.gap ?? match.rationale}</p>
                    </div>
                    <div className="match-action">
                      <span className={`pill ${match.status}`}>
                        {copy.matchStatuses[match.status]}
                      </span>
                      <button
                        className="link"
                        onClick={(event) => onSource(requirement.id, event.currentTarget)}
                      >
                        {copy.report.sources}
                      </button>
                    </div>
                  </article>
                );
              }) : <p className="notice">{copy.report.noRequirements}</p>}
            </div>
          </section>
        </div>
        <aside>
          <section className="panel">
            <p className="eyebrow">{copy.report.emphasize}</p>
            {analysis.emphasis.map((item) => (
              <article className="compact" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.angle}</p>
                <small>{item.doNotClaim}</small>
              </article>
            ))}
          </section>
          <section className="panel">
            <p className="eyebrow">{copy.report.prepare}</p>
            {analysis.questions.map((item) => (
              <article className="compact" key={item.question}>
                <p className="small"><strong>{copy.report.existingEvidence}</strong> {item.evidenceIds.length ? copy.report.linkedEvidence : copy.report.noLinkedEvidence}</p>
                <h3>{copy.report.possibleFollowUp}</h3>
                <p>{item.question}</p>
                <p><strong>{copy.report.honestAnswer}</strong> {item.preparationNote}</p>
              </article>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}
