"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/persistence/repository";

type View = "home" | "profile" | "analyze" | "report" | "saved";
type ProfileMode = "none" | "sample" | "real";
type ProjectDraft = { id: string; title: string; text: string };
const evidenceTypes: EvidenceType[] = ["production_experience", "project_experience", "work_responsibility", "measurable_outcome", "domain_experience", "education_or_certification", "constraint_fact", "self_asserted_skill", "other"];
const evidenceStrengths: EvidenceStrength[] = ["direct", "transferable", "weak"];
const applicationStatuses: ApplicationStatus[] = ["saved", "applied", "interview", "rejected", "offer"];

export function Workbench() {
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
  const [extracting, setExtracting] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [profileDirty, setProfileDirty] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jdText, setJdText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>();
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

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const storedLanguage = outputLanguageSchema.safeParse(
        window.localStorage.getItem(languageStorageKey),
      );
      const nextLanguage = storedLanguage.success
        ? storedLanguage.data
        : browserDefaultLanguage(window.navigator.language);
      setOutputLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;

      const restored = readStore();
      if (!restored.store) {
        const restoredCopy = getCopy(nextLanguage);
        setProfileError(
          restored.status === "future_version"
            ? restoredCopy.errors.storageFuture
            : restored.status === "invalid"
              ? restoredCopy.errors.storageInvalid
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
          setProfileMode(profile.id === sampleProfile.id ? "sample" : "real");
        }
        setSavedAnalyses(restored.store.analyses);
        setTrackedApplications(restored.store.trackedApplications);
      }
      setAnalysis(sampleAnalysisForLanguage(nextLanguage));
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const selected = useMemo(
    () => analysis.matches.find((item) => item.requirementId === drawerId),
    [analysis, drawerId],
  );
  const requirement = analysis.requirements.find(
    (item) => item.id === selected?.requirementId,
  );
  const evidence =
    selected?.links
      .map((link) =>
        analysis.profileSnapshot.evidence.find(
          (item) => item.id === link.evidenceId,
        ),
      )
      .filter(Boolean) ?? [];
  const visibleEvidence = profileEvidence.filter(
    (item) => evidenceFilter === "all" || item.reviewState === evidenceFilter,
  );
  const reviewedEvidence = profileEvidence.filter(
    (item) => item.reviewState === "verified" || item.reviewState === "edited",
  ).length;
  const documents = useMemo<SourceDocument[]>(
    () => [
      ...(resume.trim()
        ? [{ id: "resume", title: copy.profile.resumeText, kind: "resume" as const, text: resume }]
        : []),
      ...projects.filter((project) => project.title.trim() && project.text.trim()).map((project) => ({ id: project.id, title: project.title.trim(), kind: "project" as const, text: project.text })),
    ],
    [copy.profile.resumeText, projects, resume],
  );

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
      updatedAt: new Date().toISOString(),
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
    setAnalysis(localizedAnalysis);
    setView("report");
  };

  const updateEvidenceState = (
    id: string,
    reviewState: EvidenceItem["reviewState"],
  ) =>
    setProfileEvidence((items) =>
      items.map((item) => (item.id === id ? { ...item, reviewState } : item)),
    );

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
    setEditingEvidenceId(undefined);
    setEvidenceDraft(undefined);
  };

  const extractProfileEvidence = async () => {
    setExtracting(true);
    setProfileError(undefined);
    try {
      if (!documents.length) throw new Error(copy.profile.addResumeFirst);
      const response = await fetch("/api/evidence/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      ensureRealProfile();
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : copy.errors.extract,
      );
    } finally {
      setExtracting(false);
    }
  };

  const analyzeRealJob = async () => {
    setAnalyzing(true);
    setAnalysisError(undefined);
    try {
      if (profileMode !== "real" || !profileId) {
        throw new Error(copy.analyze.createProfileFirst);
      }
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setAnalysisError(
        error instanceof Error ? error.message : copy.errors.analyze,
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <main lang={outputLanguage}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")}>
          Apply<span>Lens</span>
        </button>
        <nav>
          <button onClick={() => setView("profile")}>{copy.nav.profile}</button>
          <button onClick={() => setView("analyze")}>{copy.nav.analyze}</button>
          <button onClick={() => setView("saved")}>{copy.nav.saved}</button>
        </nav>
        <div className="language-toggle">
          <button
            aria-pressed={outputLanguage === "zh-CN"}
            className={outputLanguage === "zh-CN" ? "active" : undefined}
            onClick={() => changeLanguage("zh-CN")}
          >
            {copy.language.chinese}
          </button>
          <button
            aria-pressed={outputLanguage === "en"}
            className={outputLanguage === "en" ? "active" : undefined}
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
              setProfileMode("none");
            } catch {
              setProfileError(copy.errors.storageWrite);
            }
          }}
        >
          {copy.nav.deleteLocalData}
        </button>
      </header>

      {view === "home" && (
        <section className="hero">
          <p className="eyebrow">{copy.home.eyebrow}</p>
          <h1>{copy.home.title}</h1>
          <p className="lede">{copy.home.description}</p>
          <div className="actions">
            <button className="primary" onClick={() => setView("analyze")}>
              {copy.home.analyze}
            </button>
            <button className="secondary" onClick={trySample}>
              {copy.home.sample}
            </button>
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
          <label>
            {copy.profile.resumeText}
            <textarea
              value={resume}
              maxLength={20_000}
              onChange={(event) => {
                setResume(event.target.value);
                setProfileDirty(true);
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
            {resume.length.toLocaleString(dateLocale(outputLanguage))} / 20,000
          </small>
          <div className="section-title">
            <h2>{copy.profile.projects}</h2>
            <button
              className="link"
              disabled={projects.length >= 5}
              onClick={() => setProjects((items) => [...items, { id: crypto.randomUUID(), title: "", text: "" }])}
            >
              {copy.profile.addProject}
            </button>
          </div>
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
                    setSaved(false);
                  }}
                />
              </label>
              <label>
                {copy.profile.projectDescription}
                <textarea
                  value={project.text}
                  maxLength={20_000}
                  onChange={(event) => {
                    setProjects((items) => items.map((item) => item.id === project.id ? { ...item, text: event.target.value } : item));
                    setProfileDirty(true);
                    setSaved(false);
                  }}
                />
              </label>
              <button className="link" onClick={() => { setProjects((items) => items.filter((item) => item.id !== project.id)); setProfileDirty(true); setSaved(false); }}>
                {copy.profile.removeProject}
              </button>
            </article>
          ))}
          <div className="row">
            <button
              className="secondary"
              disabled={extracting}
              onClick={extractProfileEvidence}
            >
              {extracting ? copy.profile.extracting : copy.profile.extract}
            </button>
            <button
              className="primary"
              disabled={profileDirty}
              onClick={() => {
                try {
                  if (!documents.length) throw new Error(copy.profile.addResumeFirst);
                  saveProfile(profileSnapshot());
                  setSaved(true);
                  setProfileError(undefined);
                } catch (error) {
                  setProfileError(error instanceof PersistenceError ? copy.errors.storageWrite : error instanceof Error ? error.message : copy.errors.storageWrite);
                }
              }}
            >
              {copy.profile.save}
            </button>
            {saved && <span className="saved">{copy.profile.saved}</span>}
          </div>
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
          <div className="section-title">
            <h2>{copy.profile.evidenceReview}</h2>
            <div className="filters">
              {(["all", "pending", "verified", "excluded"] as const).map(
                (filter) => (
                  <button
                    className={
                      evidenceFilter === filter ? "filter active" : "filter"
                    }
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
            {visibleEvidence.map((item) => (
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
                      <input value={item.sourceBlockId} readOnly />
                    </label>
                  </div>
                ) : (
                  <>
                    <h3>{item.claim}</h3>
                    <blockquote>“{item.exactQuote}”</blockquote>
                    <small>{sourceBlocks.find((block) => block.id === item.sourceBlockId)?.documentId}</small>
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
            ))}
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
          <div className="analysis-bar">
            <span>
              {copy.analyze.availableEvidence(
                profileEvidence.length,
                reviewedEvidence,
              )}
            </span>
            <label className="toggle">
              <input
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                type="checkbox"
              />
              {copy.analyze.verifiedOnly}
            </label>
            <button
              className="primary"
              disabled={analyzing || jdText.length < 100 || profileDirty || profileMode !== "real" || !profileId}
              onClick={analyzeRealJob}
            >
              {analyzing ? copy.analyze.submitting : copy.analyze.submit}
            </button>
          </div>
          {analysisError && (
            <p className="error" role="alert">
              {analysisError}
            </p>
          )}
          {profileMode !== "real" && (
            <p className="notice">{copy.analyze.createProfileFirst}</p>
          )}
          <p className="notice">{copy.analyze.notice}</p>
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
          onSource={setDrawerId}
          tracking={activeTracking}
          onSaveTracking={saveTracking}
        />
      )}

      {view === "saved" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">{copy.saved.eyebrow}</p>
            <h1>{copy.saved.title}</h1>
          </div>
          <label className="toggle">
            {copy.saved.filter}
            <select value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as ApplicationStatus | "all")}>
              <option value="all">{copy.reviewStates.all}</option>
              {applicationStatuses.map((status) => <option key={status} value={status}>{copy.applicationStatuses[status]}</option>)}
            </select>
          </label>
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
        <aside
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={copy.drawer.ariaLabel}
        >
          <button className="close" onClick={() => setDrawerId(undefined)}>
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
              {evidence.length ? (
                evidence.map((item) => (
                  <blockquote key={item?.id}>“{item?.exactQuote}”</blockquote>
                ))
              ) : (
                <p>{copy.drawer.noEvidence}</p>
              )}
            </section>
          </div>
          <p>{selected.rationale ?? selected.gap}</p>
        </aside>
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
}: {
  analysis: Analysis;
  language: OutputLanguage;
  onSource: (id: string) => void;
  tracking?: TrackedApplication;
  onSaveTracking: (id: string, changes: Pick<TrackedApplication, "status" | "jobUrl" | "notes">) => TrackedApplication | undefined;
}) {
  const copy = getCopy(language);
  const [jobUrl, setJobUrl] = useState(tracking?.jobUrl ?? "");
  const [notes, setNotes] = useState(tracking?.notes ?? "");
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
      {tracking && (
        <section className="panel tracking-panel">
          <label>
            {copy.report.applicationStatus}
            <select
              value={tracking.status}
              onChange={(event) => onSaveTracking(tracking.id, { status: event.target.value as ApplicationStatus, jobUrl, notes })}
            >
              {applicationStatuses.map((status) => (
                <option key={status} value={status}>{copy.applicationStatuses[status]}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.report.jobUrl}
            <input type="url" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="https://" />
          </label>
          <label>
            {copy.report.notes}
            <textarea value={notes} maxLength={2_000} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="secondary" onClick={() => onSaveTracking(tracking.id, { status: tracking.status, jobUrl, notes })}>
            {copy.report.saveTracking}
          </button>
        </section>
      )}
      <div className="report-layout">
        <div>
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
            <div className="matrix">
              {analysis.requirements.map((requirement) => {
                const match = analysis.matches.find(
                  (item) => item.requirementId === requirement.id,
                );
                if (!match) return null;
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
                        onClick={() => onSource(requirement.id)}
                      >
                        {copy.report.sources}
                      </button>
                    </div>
                  </article>
                );
              })}
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
