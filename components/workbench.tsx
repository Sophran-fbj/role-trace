"use client";

import { useEffect, useMemo, useState } from "react";
import { sampleAnalysis, sampleProfile } from "@/fixtures/sample";
import {
  clearLocalData,
  loadStore,
  saveAnalysis,
  saveProfile,
} from "@/lib/persistence/repository";
import {
  statusLabel,
  type Analysis,
  type EvidenceItem,
  type MatchStatus,
  type SourceBlock,
} from "@/domain/types";

type View = "home" | "profile" | "analyze" | "report" | "saved";
const recommendationCopy = {
  apply: "Worth applying",
  consider: "Worth considering",
  skip: "Not a strong use of your time",
  need_more_information: "Clarify before deciding",
};

export function Workbench() {
  const [view, setView] = useState<View>("home");
  const [analysis, setAnalysis] = useState<Analysis>(sampleAnalysis);
  const [drawerId, setDrawerId] = useState<string>();
  const [resume, setResume] = useState(sampleProfile.documents[0].text);
  const [profileEvidence, setProfileEvidence] = useState<EvidenceItem[]>(
    sampleProfile.evidence,
  );
  const [sourceBlocks, setSourceBlocks] = useState<SourceBlock[]>(
    sampleProfile.sourceBlocks,
  );
  const [extracting, setExtracting] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [profileDirty, setProfileDirty] = useState(false);
  const [jobTitle, setJobTitle] = useState("Frontend Engineer");
  const [company, setCompany] = useState("Harbor Protocol");
  const [jdText, setJdText] = useState(sampleAnalysis.job.rawText);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>();
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState<
    "all" | "pending" | "verified" | "excluded"
  >("all");
  const [savedAnalyses, setSavedAnalyses] = useState<Analysis[]>([]);
  useEffect(() => {
    const restore = window.setTimeout(() => {
      const store = loadStore();
      if (store.profile) {
        setResume(store.profile.documents[0]?.text ?? "");
        setProfileEvidence(store.profile.evidence);
        setSourceBlocks(store.profile.sourceBlocks);
      }
      setSavedAnalyses(store.analyses);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);
  const [saved, setSaved] = useState(false);
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
  const trySample = () => {
    saveProfile(sampleProfile);
    saveAnalysis(sampleAnalysis);
    setSavedAnalyses((items) => [
      sampleAnalysis,
      ...items.filter((item) => item.id !== sampleAnalysis.id),
    ]);
    setAnalysis(sampleAnalysis);
    setView("report");
  };
  const updateEvidenceState = (
    id: string,
    reviewState: EvidenceItem["reviewState"],
  ) =>
    setProfileEvidence((items) =>
      items.map((item) => (item.id === id ? { ...item, reviewState } : item)),
    );
  const extractProfileEvidence = async () => {
    setExtracting(true);
    setProfileError(undefined);
    try {
      const response = await fetch("/api/evidence/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [
            { id: "resume", title: "Resume", kind: "resume", text: resume },
          ],
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { evidence: EvidenceItem[]; sourceBlocks: SourceBlock[] };
        error?: { message: string };
      };
      if (!payload.ok || !payload.data)
        throw new Error(
          payload.error?.message ?? "Could not extract evidence.",
        );
      setProfileEvidence(payload.data.evidence);
      setSourceBlocks(payload.data.sourceBlocks);
      setProfileDirty(false);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Could not extract evidence.",
      );
    } finally {
      setExtracting(false);
    }
  };
  const analyzeRealJob = async () => {
    setAnalyzing(true);
    setAnalysisError(undefined);
    try {
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
          profile: {
            ...sampleProfile,
            documents: [
              { id: "resume", title: "Resume", kind: "resume", text: resume },
            ],
            sourceBlocks,
            evidence: profileEvidence,
            updatedAt: new Date().toISOString(),
          },
          verifiedOnly,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: Analysis;
        error?: { message: string };
      };
      if (!payload.ok || !payload.data)
        throw new Error(
          payload.error?.message ?? "Could not analyze this job.",
        );
      saveAnalysis(payload.data);
      setSavedAnalyses((items) => [
        payload.data!,
        ...items.filter((item) => item.id !== payload.data!.id),
      ]);
      setAnalysis(payload.data);
      setView("report");
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "Could not analyze this job.",
      );
    } finally {
      setAnalyzing(false);
    }
  };
  const nav = (target: View) => setView(target);
  const visibleEvidence = profileEvidence.filter(
    (item) => evidenceFilter === "all" || item.reviewState === evidenceFilter,
  );
  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => nav("home")}>
          Apply<span>Lens</span>
        </button>
        <nav>
          <button onClick={() => nav("profile")}>Profile</button>
          <button onClick={() => nav("analyze")}>Analyze</button>
          <button onClick={() => nav("saved")}>Saved reports</button>
        </nav>
        <button
          className="quiet"
          onClick={() => {
            clearLocalData();
            setSaved(false);
            setSavedAnalyses([]);
          }}
        >
          Delete local data
        </button>
      </header>
      {view === "home" && (
        <section className="hero">
          <p className="eyebrow">AUDITABLE APPLICATION DECISIONS</p>
          <h1>Know what your experience actually supports.</h1>
          <p className="lede">
            ApplyLens maps a job description to source-backed career
            evidence—without inventing experience or pretending to predict
            hiring outcomes.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => nav("analyze")}>
              Analyze a job
            </button>
            <button className="secondary" onClick={trySample}>
              Try sample
            </button>
          </div>
          <div className="trust">
            <span>✓ No invented experience</span>
            <span>↗ Every match cites evidence</span>
            <span>◎ No opaque score</span>
          </div>
          <article className="preview">
            <p className="eyebrow">EXAMPLE REQUIREMENT</p>
            <h3>Production React + TypeScript</h3>
            <span className="pill strong_match">Strong match</span>
            <p>
              “Built and shipped customer-facing React and TypeScript features…”
            </p>
          </article>
        </section>
      )}
      {view === "profile" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">CANDIDATE PROFILE</p>
            <h1>Your evidence, before the job.</h1>
            <p>
              Paste source material first. Each extracted item must remain tied
              to an exact quote.
            </p>
          </div>
          <label>
            Resume text
            <textarea
              value={resume}
              maxLength={20000}
          onChange={(event) => {
            setResume(event.target.value);
            setProfileDirty(true);
          }}
            />
          </label>
          <small>{resume.length.toLocaleString()} / 20,000 characters</small>
          <div className="row">
            <button
              className="secondary"
              disabled={extracting}
              onClick={extractProfileEvidence}
            >
              {extracting ? "Extracting evidence…" : "Extract evidence"}
            </button>
          <button
            className="primary"
            disabled={profileDirty}
              onClick={() => {
                saveProfile({
                  ...sampleProfile,
                  documents: [
                    {
                      id: "resume",
                      title: "Resume",
                      kind: "resume",
                      text: resume,
                    },
                  ],
                  sourceBlocks,
                  evidence: profileEvidence,
                  updatedAt: new Date().toISOString(),
                });
                setSaved(true);
              }}
            >
              Save profile
            </button>
            {saved && (
              <span className="saved">Saved locally in this browser.</span>
            )}
          </div>
        {profileDirty && <p className="error" role="alert">Resume changed. Re-extract evidence before saving or analyzing.</p>}
        {profileError && (
            <p className="error" role="alert">
              {profileError}
            </p>
          )}
          <div className="section-title">
            <h2>Evidence review</h2>
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
                    {filter}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="cards">
            {visibleEvidence.map((item) => (
              <article className="evidence" key={item.id}>
                <div>
                  <span className="pill neutral">{item.reviewState}</span>
                  <span className="pill neutral">
                    {item.type.replaceAll("_", " ")}
                  </span>
                </div>
                <h3>{item.claim}</h3>
                <blockquote>“{item.exactQuote}”</blockquote>
                <small>
                  {
                    sourceBlocks.find(
                      (block) => block.id === item.sourceBlockId,
                    )?.documentId
                  }
                </small>
                <div className="evidence-actions">
                  <button
                    className="link"
                    onClick={() => updateEvidenceState(item.id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    className="link"
                    onClick={() => updateEvidenceState(item.id, "edited")}
                  >
                    Mark edited
                  </button>
                  <button
                    className="link"
                    onClick={() => updateEvidenceState(item.id, "excluded")}
                  >
                    Exclude
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
            <p className="eyebrow">JOB ANALYSIS</p>
            <h1>Map a role to available evidence.</h1>
            <p>
              Only evidence marked available to analysis can support a match.
            </p>
          </div>
          <div className="formgrid">
            <label>
              Job title
              <input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </label>
            <label>
              Company
              <input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </label>
          </div>
          <label>
            Job description
            <textarea
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              maxLength={20000}
            />
          </label>
          <div className="analysis-bar">
            <span>
              {profileEvidence.length} evidence items available ·{" "}
              {
                profileEvidence.filter(
                  (item) =>
                    item.reviewState === "verified" ||
                    item.reviewState === "edited",
                ).length
              }{" "}
              verified
            </span>
            <label className="toggle">
              <input
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                type="checkbox"
              />
              Verified evidence only
            </label>
            <button
              className="primary"
            disabled={analyzing || jdText.length < 100 || profileDirty}
              onClick={analyzeRealJob}
            >
              {analyzing ? "Analyzing…" : "Analyze job"}
            </button>
          </div>
          {analysisError && (
            <p className="error" role="alert">
              {analysisError}
            </p>
          )}
          <p className="notice">
            Sample mode is available from the home page. Real analysis preserves
            your input if the provider is unavailable.
          </p>
        </section>
      )}
      {view === "report" && (
        <Report analysis={analysis} onSource={setDrawerId} />
      )}
      {view === "saved" && (
        <section className="page">
          <div className="page-heading">
            <p className="eyebrow">SAVED ANALYSES</p>
            <h1>Reports saved in this browser.</h1>
          </div>
          <div className="matrix">
            {savedAnalyses.length ? (
              savedAnalyses.map((item) => (
                <article className="requirement" key={item.id}>
                  <div>
                    <h3>{item.job.title ?? "Untitled job"}</h3>
                    <p>
                      {item.job.company ?? "Company not specified"} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setAnalysis(item);
                      setView("report");
                    }}
                  >
                    Open report
                  </button>
                </article>
              ))
            ) : (
              <p className="notice">
                No saved reports yet. Try Sample Mode or analyze a job.
              </p>
            )}
          </div>
        </section>
      )}
      {selected && requirement && (
        <aside
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Source evidence"
        >
          <button className="close" onClick={() => setDrawerId(undefined)}>
            ×
          </button>
          <p className="eyebrow">SOURCE COMPARISON</p>
          <h2>{requirement.label}</h2>
          <div className="source-grid">
            <section>
              <small>JOB DESCRIPTION</small>
              <blockquote>“{requirement.sources.map((source) => source.exactQuote).join(" ")}”</blockquote>
            </section>
            <section>
              <small>CANDIDATE EVIDENCE</small>
              {evidence.length ? (
                evidence.map((item) => (
                  <blockquote key={item?.id}>“{item?.exactQuote}”</blockquote>
                ))
              ) : (
                <p>No evidence was used for this status.</p>
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
  onSource,
}: {
  analysis: Analysis;
  onSource: (id: string) => void;
}) {
  return (
    <section className="page report">
      <div className="report-head">
        <div>
          <p className="eyebrow">APPLICATION REPORT · {analysis.isSample ? "SAMPLE MODE" : "ANALYSIS"}</p>
          <h1>
            {analysis.job.title} <span>at {analysis.job.company}</span>
          </h1>
          <p>Generated {new Date(analysis.createdAt).toLocaleString()} · Profile evidence snapshot</p>
        </div>
        <div className={`recommendation ${analysis.recommendation}`}>
          <small>RECOMMENDATION</small>
          <strong>{recommendationCopy[analysis.recommendation]}</strong>
        </div>
      </div>
      <div className="report-layout">
        <div>
          <section className="panel">
            <h2>Why this direction</h2>
            {analysis.reasons.map((reason) => (
              <p key={reason}>• {reason}</p>
            ))}
          </section>
          <section>
            <div className="section-title">
              <div>
                <p className="eyebrow">REQUIREMENT MATRIX</p>
                <h2>What the evidence supports</h2>
              </div>
              <p className="small">No overall match percentage</p>
            </div>
            <div className="matrix">
              {analysis.requirements.map((requirement) => {
                const match = analysis.matches.find(
                  (item) => item.requirementId === requirement.id,
                )!;
                return (
                  <article key={requirement.id} className="requirement">
                    <div>
                      <span className="pill neutral">
                        {requirement.priority}
                      </span>
                      <h3>{requirement.label}</h3>
                      <p>{match.gap ?? match.rationale}</p>
                    </div>
                    <div className="match-action">
                      <span className={`pill ${match.status}`}>
                        {statusLabel[match.status as MatchStatus]}
                      </span>
                      <button
                        className="link"
                        onClick={() => onSource(requirement.id)}
                      >
                        View sources
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
            <p className="eyebrow">WHAT TO EMPHASIZE</p>
            {analysis.emphasis.map((item) => (
              <article className="compact" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.angle}</p>
                <small>{item.doNotClaim}</small>
              </article>
            ))}
          </section>
          <section className="panel">
            <p className="eyebrow">PREPARE FOR</p>
            {analysis.questions.map((item) => (
              <article className="compact" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.preparationNote}</p>
              </article>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}
