import { z } from "zod";
import type {
  EvidenceType,
  EvidenceStrength,
  ApplicationStatus,
  MatchStatus,
  Recommendation,
  RequirementPriority,
  ReviewState,
} from "@/domain/types";

export const outputLanguages = ["zh-CN", "en"] as const;
export type OutputLanguage = (typeof outputLanguages)[number];
export const outputLanguageSchema = z.enum(outputLanguages);
export const languageStorageKey = "applylens.language";

type Copy = {
  nav: {
    profile: string;
    analyze: string;
    saved: string;
    deleteLocalData: string;
  };
  language: { chinese: string; english: string };
  home: {
    eyebrow: string;
    title: string;
    description: string;
    analyze: string;
    sample: string;
    trust: [string, string, string];
    example: string;
    exampleRequirement: string;
    exampleStatus: string;
    exampleQuote: string;
  };
  profile: {
    eyebrow: string;
    title: string;
    description: string;
    resumeText: string;
    extract: string;
    extracting: string;
    save: string;
    saved: string;
    dirty: string;
    evidenceReview: string;
    projects: string;
    addProject: string;
    removeProject: string;
    projectTitle: (index: number) => string;
    projectDescription: string;
    addResumeFirst: string;
    verify: string;
    edit: string;
    saveEdit: string;
    cancelEdit: string;
    claim: string;
    evidenceType: string;
    strength: string;
    exactQuote: string;
    sourceBlock: string;
    exclude: string;
  };
  analyze: {
    eyebrow: string;
    title: string;
    description: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    availableEvidence: (total: number, reviewed: number) => string;
    verifiedOnly: string;
    submit: string;
    submitting: string;
    notice: string;
    createProfileFirst: string;
  };
  saved: {
    eyebrow: string;
    title: string;
    untitledJob: string;
    unspecifiedCompany: string;
    open: string;
    empty: string;
    filter: string;
    applicationStatus: string;
    savedAt: string;
    appliedAt: string;
    updatedAt: string;
    jobUrl: string;
    notes: string;
    saveChanges: string;
  };
  drawer: {
    ariaLabel: string;
    sourceComparison: string;
    jobDescription: string;
    candidateEvidence: string;
    noEvidence: string;
  };
  report: {
    heading: string;
    sample: string;
    analysis: string;
    at: string;
    generated: (date: string) => string;
    recommendation: string;
    why: string;
    matrix: string;
    supported: string;
    noScore: string;
    sources: string;
    emphasize: string;
    prepare: string;
    existingEvidence: string;
    possibleFollowUp: string;
    honestAnswer: string;
    linkedEvidence: string;
    noLinkedEvidence: string;
    applicationStatus: string;
    jobUrl: string;
    notes: string;
    saveTracking: string;
  };
  reviewStates: Record<ReviewState | "all", string>;
  evidenceTypes: Record<EvidenceType, string>;
  evidenceStrengths: Record<EvidenceStrength, string>;
  priorities: Record<RequirementPriority, string>;
  matchStatuses: Record<MatchStatus, string>;
  recommendations: Record<Recommendation, string>;
  applicationStatuses: Record<ApplicationStatus, string>;
  errors: {
    extract: string;
    analyze: string;
    invalidInput: string;
    providerUnavailable: string;
    structuredOutput: string;
    requestFailed: string;
    storageWrite: string;
    storageFuture: string;
    storageInvalid: string;
    confirmDeleteLocalData: string;
  };
  generated: {
    confirmedConstraint: (label: string) => string;
    unresolvedConstraint: (label: string) => string;
    directSupport: (label: string) => string;
    partialSupport: (label: string, gap: string) => string;
    conflictingCore: (label: string) => string;
    noEvidenceCore: (label: string) => string;
    unknownCore: (label: string) => string;
    partialGap: string;
    missingInformation: string;
    insufficientSupport: string;
  };
};

const copy: Record<OutputLanguage, Copy> = {
  en: {
    nav: {
      profile: "Profile",
      analyze: "Analyze",
      saved: "Applications",
      deleteLocalData: "Delete local data",
    },
    language: { chinese: "中文", english: "EN" },
    home: {
      eyebrow: "AUDITABLE APPLICATION DECISIONS",
      title: "Know what your experience actually supports.",
      description:
        "ApplyLens maps a job description to source-backed career evidence—without inventing experience or pretending to predict hiring outcomes.",
      analyze: "Analyze a job",
      sample: "Try sample",
      trust: [
        "No invented experience",
        "Every match cites evidence",
        "No opaque score",
      ],
      example: "EXAMPLE REQUIREMENT",
      exampleRequirement: "Production React + TypeScript",
      exampleStatus: "Strong match",
      exampleQuote:
        "Built and shipped customer-facing React and TypeScript features",
    },
    profile: {
      eyebrow: "CANDIDATE PROFILE",
      title: "Your evidence, before the job.",
      description:
        "Paste source material first. Each extracted item must remain tied to an exact quote.",
      resumeText: "Resume text",
      extract: "Extract evidence",
      extracting: "Extracting evidence…",
      save: "Save profile",
      saved: "Saved locally in this browser.",
      dirty: "Resume changed. Re-extract evidence before saving or analyzing.",
      evidenceReview: "Evidence review",
      projects: "Projects",
      addProject: "Add project",
      removeProject: "Remove project",
      projectTitle: (index) => `Project ${index} title`,
      projectDescription: "Project description",
      addResumeFirst: "Add resume text before extracting or saving.",
      verify: "Verify",
      edit: "Edit evidence",
      saveEdit: "Save edit",
      cancelEdit: "Cancel",
      claim: "Claim",
      evidenceType: "Evidence type",
      strength: "Strength",
      exactQuote: "Exact quote (read-only)",
      sourceBlock: "Source block (read-only)",
      exclude: "Exclude",
    },
    analyze: {
      eyebrow: "JOB ANALYSIS",
      title: "Map a role to available evidence.",
      description:
        "Only evidence marked available to analysis can support a match.",
      jobTitle: "Job title",
      company: "Company",
      jobDescription: "Job description",
      availableEvidence: (total, reviewed) =>
        `${total} evidence items available · ${reviewed} reviewed`,
      verifiedOnly: "Verified evidence only",
      submit: "Analyze job",
      submitting: "Analyzing…",
      notice:
        "Sample mode is available from the home page. Real analysis preserves your input if the provider is unavailable.",
      createProfileFirst: "Create and save a real profile before analyzing a job.",
    },
    saved: {
      eyebrow: "APPLICATIONS",
      title: "Tracked applications in this browser.",
      untitledJob: "Untitled job",
      unspecifiedCompany: "Company not specified",
      open: "Open report",
      empty: "No tracked applications yet. Analyze a real job to save one.",
      filter: "Filter status",
      applicationStatus: "Application status",
      savedAt: "Saved",
      appliedAt: "Applied",
      updatedAt: "Updated",
      jobUrl: "Job URL",
      notes: "Notes",
      saveChanges: "Save changes",
    },
    drawer: {
      ariaLabel: "Source evidence",
      sourceComparison: "SOURCE COMPARISON",
      jobDescription: "JOB DESCRIPTION",
      candidateEvidence: "CANDIDATE EVIDENCE",
      noEvidence: "No evidence was used for this status.",
    },
    report: {
      heading: "APPLICATION REPORT",
      sample: "SAMPLE MODE",
      analysis: "ANALYSIS",
      at: "at",
      generated: (date) => `Generated ${date} · Profile evidence snapshot`,
      recommendation: "RECOMMENDATION",
      why: "Why this direction",
      matrix: "REQUIREMENT MATRIX",
      supported: "What the evidence supports",
      noScore: "No overall match percentage",
      sources: "View sources",
      emphasize: "WHAT TO EMPHASIZE",
      prepare: "PREPARE FOR",
      existingEvidence: "Evidence you have:",
      possibleFollowUp: "Possible follow-up:",
      honestAnswer: "If you have not done this, answer honestly and describe your design approach:",
      linkedEvidence: "Source-backed evidence is linked to this question.",
      noLinkedEvidence: "No evidence is linked; treat this as a hypothetical question.",
      applicationStatus: "APPLICATION STATUS",
      jobUrl: "Job URL",
      notes: "Notes",
      saveTracking: "Save application details",
    },
    reviewStates: {
      all: "All",
      pending: "Pending",
      verified: "Verified",
      edited: "Edited",
      excluded: "Excluded",
    },
    evidenceTypes: {
      production_experience: "Production experience",
      project_experience: "Project experience",
      work_responsibility: "Work responsibility",
      measurable_outcome: "Measurable outcome",
      domain_experience: "Domain experience",
      education_or_certification: "Education or certification",
      constraint_fact: "Constraint fact",
      self_asserted_skill: "Self-asserted skill",
      other: "Other",
    },
    evidenceStrengths: {
      direct: "Direct",
      transferable: "Transferable",
      weak: "Weak",
    },
    priorities: {
      core: "Core",
      preferred: "Preferred",
      context: "Context",
      uncertain: "Uncertain",
    },
    matchStatuses: {
      strong_match: "Strong match",
      partial_match: "Partial match",
      no_evidence_provided: "No evidence provided",
      conflicting_evidence: "Conflicting evidence",
      unknown: "Unknown",
    },
    recommendations: {
      apply: "Worth applying",
      consider: "Worth considering",
      skip: "Not a strong use of your time",
      need_more_information: "Clarify before deciding",
    },
    applicationStatuses: {
      saved: "Saved",
      applied: "Applied",
      interview: "Interview",
      rejected: "Rejected",
      offer: "Offer",
    },
    errors: {
      extract: "Could not extract evidence.",
      analyze: "Could not analyze this job.",
      invalidInput: "The request is invalid.",
      providerUnavailable:
        "The AI provider is unavailable. Please retry or use Sample Mode.",
      structuredOutput:
        "The AI provider returned invalid structured output. Please retry.",
      requestFailed: "The request could not be completed. Please retry.",
      storageWrite: "This browser could not save ApplyLens data.",
      storageFuture: "This browser has data from a newer ApplyLens version. It was not changed.",
      storageInvalid: "Saved ApplyLens data is invalid and was not loaded.",
      confirmDeleteLocalData: "Delete all local profiles, analyses, and tracked applications from this browser?",
    },
    generated: {
      confirmedConstraint: (label) =>
        `Validated evidence conflicts with the required constraint “${label}”.`,
      unresolvedConstraint: (label) =>
        `The required constraint “${label}” is not established by reviewed direct evidence.`,
      directSupport: (label) =>
        `${label}: direct evidence supports this core requirement.`,
      partialSupport: (label, gap) => `${label}: ${gap}.`,
      conflictingCore: (label) => `${label}: reviewed evidence directly conflicts with this core requirement.`,
      noEvidenceCore: (label) => `${label}: no supporting evidence was provided.`,
      unknownCore: (label) => `${label}: the available information cannot establish this requirement.`,
      partialGap: "related evidence supports only part of this requirement",
      missingInformation:
        "Key information is missing, so the evidence does not support a responsible recommendation yet.",
      insufficientSupport:
        "Core requirements do not have enough source-backed support.",
    },
  },
  "zh-CN": {
    nav: {
      profile: "资料",
      analyze: "分析职位",
      saved: "求职记录",
      deleteLocalData: "删除本地数据",
    },
    language: { chinese: "中文", english: "EN" },
    home: {
      eyebrow: "可审计的求职决策",
      title: "了解你的经历真正能支持什么。",
      description:
        "ApplyLens 将职位描述与有原文依据的职业证据对应，不虚构经历，也不假装预测招聘结果。",
      analyze: "分析职位",
      sample: "查看示例",
      trust: ["不虚构经历", "每个匹配均有证据引用", "不提供黑箱分数"],
      example: "示例要求",
      exampleRequirement: "生产环境 React 与 TypeScript",
      exampleStatus: "强匹配",
      exampleQuote: "交付面向客户的 React 和 TypeScript 功能",
    },
    profile: {
      eyebrow: "候选人资料",
      title: "先整理证据，再分析职位。",
      description: "先粘贴原始材料。每条提取的内容都必须关联到一段精确原文。",
      resumeText: "简历原文",
      extract: "提取证据",
      extracting: "正在提取证据…",
      save: "保存资料",
      saved: "已保存到当前浏览器。",
      dirty: "简历已修改。请重新提取证据后再保存或分析。",
      evidenceReview: "证据审核",
      projects: "项目材料",
      addProject: "添加项目",
      removeProject: "移除项目",
      projectTitle: (index) => `项目 ${index} 标题`,
      projectDescription: "项目描述",
      addResumeFirst: "请先填写简历文本，再提取或保存。",
      verify: "确认",
      edit: "编辑证据",
      saveEdit: "保存编辑",
      cancelEdit: "取消",
      claim: "事实摘要",
      evidenceType: "证据类型",
      strength: "强度",
      exactQuote: "原文引用（只读）",
      sourceBlock: "来源区块（只读）",
      exclude: "排除",
    },
    analyze: {
      eyebrow: "职位分析",
      title: "将职位要求映射到现有证据。",
      description: "只有可用于分析的证据才能支持匹配结论。",
      jobTitle: "职位名称",
      company: "公司",
      jobDescription: "职位描述",
      availableEvidence: (total, reviewed) =>
        `可用证据 ${total} 条 · 已审核 ${reviewed} 条`,
      verifiedOnly: "仅使用已审核证据",
      submit: "分析职位",
      submitting: "正在分析…",
      notice:
        "可从首页查看示例模式。若模型服务不可用，真实分析不会修改你的输入。",
      createProfileFirst: "请先创建并保存真实 Profile，再分析职位。",
    },
    saved: {
      eyebrow: "求职记录",
      title: "保存在当前浏览器中的求职流程。",
      untitledJob: "未命名职位",
      unspecifiedCompany: "未填写公司",
      open: "打开报告",
      empty: "还没有求职记录。请分析一个真实职位以创建记录。",
      filter: "筛选状态",
      applicationStatus: "求职状态",
      savedAt: "保存于",
      appliedAt: "申请于",
      updatedAt: "最近更新",
      jobUrl: "职位链接",
      notes: "备注",
      saveChanges: "保存修改",
    },
    drawer: {
      ariaLabel: "来源证据",
      sourceComparison: "来源对照",
      jobDescription: "职位描述",
      candidateEvidence: "候选人证据",
      noEvidence: "该状态未使用证据。",
    },
    report: {
      heading: "求职分析报告",
      sample: "示例模式",
      analysis: "分析结果",
      at: "@",
      generated: (date) => `生成于 ${date} · 资料证据快照`,
      recommendation: "建议",
      why: "建议依据",
      matrix: "要求矩阵",
      supported: "证据能够支持的内容",
      noScore: "不提供整体匹配百分比",
      sources: "查看来源",
      emphasize: "建议重点强调",
      prepare: "建议准备",
      existingEvidence: "你已有的证据：",
      possibleFollowUp: "可能被追问的内容：",
      honestAnswer: "如果没有实际做过，请诚实说明并描述你的设计思路：",
      linkedEvidence: "这道问题已关联原文证据。",
      noLinkedEvidence: "没有关联证据；请将其视为假设性问题。",
      applicationStatus: "求职状态",
      jobUrl: "职位链接",
      notes: "备注",
      saveTracking: "保存求职信息",
    },
    reviewStates: {
      all: "全部",
      pending: "待审核",
      verified: "已确认",
      edited: "已编辑",
      excluded: "已排除",
    },
    evidenceTypes: {
      production_experience: "生产环境经验",
      project_experience: "项目经验",
      work_responsibility: "工作职责",
      measurable_outcome: "可量化成果",
      domain_experience: "领域经验",
      education_or_certification: "教育或认证",
      constraint_fact: "条件事实",
      self_asserted_skill: "自述技能",
      other: "其他",
    },
    evidenceStrengths: {
      direct: "直接",
      transferable: "可迁移",
      weak: "较弱",
    },
    priorities: {
      core: "核心",
      preferred: "加分项",
      context: "背景",
      uncertain: "待确认",
    },
    matchStatuses: {
      strong_match: "强匹配",
      partial_match: "部分匹配",
      no_evidence_provided: "未提供证据",
      conflicting_evidence: "存在冲突证据",
      unknown: "未知",
    },
    recommendations: {
      apply: "值得投递",
      consider: "值得考虑",
      skip: "暂不建议投入时间",
      need_more_information: "确认信息后再决定",
    },
    applicationStatuses: {
      saved: "已保存",
      applied: "已申请",
      interview: "面试中",
      rejected: "已拒绝",
      offer: "已获 Offer",
    },
    errors: {
      extract: "无法提取证据。",
      analyze: "无法分析该职位。",
      invalidInput: "请求内容无效。",
      providerUnavailable: "模型服务暂不可用，请重试或使用示例模式。",
      structuredOutput: "模型服务返回了无效的结构化结果，请重试。",
      requestFailed: "请求未能完成，请重试。",
      storageWrite: "此浏览器无法保存 ApplyLens 数据。",
      storageFuture: "此浏览器中的数据来自较新的 ApplyLens 版本，未进行修改。",
      storageInvalid: "已保存的 ApplyLens 数据无效，未被加载。",
      confirmDeleteLocalData: "要删除此浏览器中的所有资料、分析和求职记录吗？",
    },
    generated: {
      confirmedConstraint: (label) =>
        `已确认的证据与必备条件“${label}”存在冲突。`,
      unresolvedConstraint: (label) =>
        `经审核的直接证据尚不能确认必备条件“${label}”。`,
      directSupport: (label) => `${label}：直接证据支持这项核心要求。`,
      partialSupport: (label, gap) => `${label}：${gap}。`,
      conflictingCore: (label) => `${label}：经审核的证据与这项核心要求直接冲突。`,
      noEvidenceCore: (label) => `${label}：没有提供支持这项要求的证据。`,
      unknownCore: (label) => `${label}：现有信息无法确认这项要求。`,
      partialGap: "相关证据只能支持这项要求的一部分",
      missingInformation: "关键信息缺失，现有证据尚不足以给出负责任的建议。",
      insufficientSupport: "核心要求缺少足够的原文证据支持。",
    },
  },
};

export function getCopy(language: OutputLanguage): Copy {
  return copy[language];
}

export function browserDefaultLanguage(
  browserLanguage: string | undefined,
): OutputLanguage {
  return browserLanguage?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function dateLocale(language: OutputLanguage): string {
  return language === "zh-CN" ? "zh-CN" : "en-US";
}
