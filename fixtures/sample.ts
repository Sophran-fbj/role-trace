import type { Analysis, CandidateProfile, Job } from "@/domain/types";
import { RULE_VERSION, SCHEMA_VERSION } from "@/domain/types";
import { segmentDocuments } from "@/lib/grounding/segmentation";
import type { OutputLanguage } from "@/lib/i18n";

const now = "2026-09-07T12:00:00.000Z";
const documents = [
  {
    id: "sample-resume",
    title: "Maya Chen — Resume",
    kind: "resume" as const,
    text: "Maya Chen\nFrontend engineer focused on reliable product interfaces.\n\nNorthstar Labs — Frontend Engineer (2024–present)\nBuilt and shipped customer-facing React and TypeScript features for a B2B analytics platform. Partnered with product and design to own features from discovery through release.\n\nOrbit Wallet — Contract Developer (2023–2024)\nImplemented transaction history and wallet connection flows with React, TypeScript, and wagmi. Wrote component tests and improved accessibility for keyboard navigation.",
  },
  {
    id: "sample-project",
    title: "Protocol Desk",
    kind: "project" as const,
    text: "Protocol Desk — personal project\nBuilt a responsive DeFi dashboard using Next.js, TypeScript, and viem. Integrated read-only on-chain data and documented architecture decisions. This was a personal project, not production employment.",
  },
];
export const sampleProfile: CandidateProfile = {
  id: "sample-profile",
  displayName: "Maya Chen",
  documents,
  sourceBlocks: segmentDocuments(documents),
  createdAt: now,
  updatedAt: now,
  schemaVersion: SCHEMA_VERSION,
  evidence: [
    {
      id: "ev-1",
      claim:
        "Shipped React and TypeScript features for a B2B analytics platform.",
      sourceBlockId: "sample-resume:block:2",
      exactQuote:
        "Built and shipped customer-facing React and TypeScript features for a B2B analytics platform.",
      type: "production_experience",
      strength: "direct",
      tags: ["React", "TypeScript", "B2B"],
      reviewState: "verified",
    },
    {
      id: "ev-2",
      claim:
        "Owned features with product and design from discovery through release.",
      sourceBlockId: "sample-resume:block:2",
      exactQuote:
        "Partnered with product and design to own features from discovery through release.",
      type: "work_responsibility",
      strength: "direct",
      tags: ["product", "design", "ownership"],
      reviewState: "verified",
    },
    {
      id: "ev-3",
      claim:
        "Built a personal DeFi dashboard with Next.js, TypeScript, and viem.",
      sourceBlockId: "sample-project:block:1",
      exactQuote:
        "Built a responsive DeFi dashboard using Next.js, TypeScript, and viem.",
      type: "project_experience",
      strength: "direct",
      tags: ["DeFi", "Next.js", "viem"],
      reviewState: "pending",
    },
  ],
};
export const sampleJob: Job = {
  id: "sample-job",
  title: "Frontend Engineer",
  company: "Harbor Protocol",
  createdAt: now,
  rawText:
    "Harbor Protocol is hiring a Frontend Engineer. You will build production React and TypeScript interfaces for DeFi users, work closely with product and design, and own features end to end. Experience with wallet integrations and GraphQL is preferred. You must be able to work from Singapore three days a week.",
};
export const sampleAnalysis: Analysis = {
  id: "sample-analysis",
  job: sampleJob,
  profileUpdatedAt: now,
  profileSnapshot: {
    id: sampleProfile.id,
    documents: sampleProfile.documents,
    sourceBlocks: sampleProfile.sourceBlocks,
    evidence: sampleProfile.evidence,
    updatedAt: now,
  },
  schemaVersion: SCHEMA_VERSION,
  ruleVersion: RULE_VERSION,
  createdAt: now,
  isSample: true,
  constraints: [
    {
      requirementId: "req-6",
      status: "unresolved",
      detail:
        "The profile does not state whether Maya can work from Singapore three days a week.",
      evidenceIds: [],
    },
  ],
  recommendation: "need_more_information",
  requirements: [
    {
      id: "req-1",
      label: "Production React and TypeScript interfaces",
      category: "technical_skill",
      priority: "core",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote:
            "build production React and TypeScript interfaces for DeFi users",
        },
      ],
      mayBeHardConstraint: false,
    },
    {
      id: "req-2",
      label: "Work closely with product and design",
      category: "collaboration",
      priority: "core",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote: "work closely with product and design",
        },
      ],
      mayBeHardConstraint: false,
    },
    {
      id: "req-3",
      label: "Own features end to end",
      category: "responsibility",
      priority: "core",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote: "own features end to end",
        },
      ],
      mayBeHardConstraint: false,
    },
    {
      id: "req-4",
      label: "Wallet integrations",
      category: "technical_skill",
      priority: "preferred",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote: "Experience with wallet integrations",
        },
      ],
      mayBeHardConstraint: false,
    },
    {
      id: "req-5",
      label: "GraphQL",
      category: "technical_skill",
      priority: "preferred",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote: "GraphQL is preferred",
        },
      ],
      mayBeHardConstraint: false,
    },
    {
      id: "req-6",
      label: "Work from Singapore three days a week",
      category: "location_or_work_mode",
      priority: "core",
      sources: [
        {
          sourceBlockId: "sample-job:block:1",
          exactQuote: "must be able to work from Singapore three days a week",
        },
      ],
      mayBeHardConstraint: true,
    },
  ],
  matches: [
    {
      requirementId: "req-1",
      proposedStatus: "strong_match",
      status: "strong_match",
      links: [{ evidenceId: "ev-1", relationship: "direct" }],
      rationale: "Direct production evidence for both named technologies.",
    },
    {
      requirementId: "req-2",
      proposedStatus: "strong_match",
      status: "strong_match",
      links: [{ evidenceId: "ev-2", relationship: "direct" }],
      rationale:
        "The evidence explicitly names product and design collaboration.",
    },
    {
      requirementId: "req-3",
      proposedStatus: "strong_match",
      status: "strong_match",
      links: [{ evidenceId: "ev-2", relationship: "direct" }],
      rationale: "The evidence explicitly describes end-to-end ownership.",
    },
    {
      requirementId: "req-4",
      proposedStatus: "partial_match",
      status: "partial_match",
      links: [{ evidenceId: "ev-3", relationship: "transferable" }],
      gap: "Production context is not evidenced.",
      rationale: "Relevant wallet work is present.",
    },
    {
      requirementId: "req-5",
      proposedStatus: "no_evidence_provided",
      status: "no_evidence_provided",
      links: [],
      gap: "GraphQL is not evidenced.",
      rationale: null,
    },
    {
      requirementId: "req-6",
      proposedStatus: "unknown",
      status: "unknown",
      links: [],
      gap: "Location availability is not provided.",
      rationale: null,
    },
  ],
  reasons: [
    "Production React and TypeScript evidence supports the primary engineering requirement.",
    "Evidence shows direct collaboration with product and design and end-to-end ownership.",
    "Singapore availability is required but not evidenced, so a responsible decision needs confirmation.",
  ],
  emphasis: [
    {
      title: "Production React + TypeScript delivery",
      evidenceIds: ["ev-1"],
      requirementIds: ["req-1"],
      rationale: "It directly supports a core requirement.",
      angle: "Lead with shipped customer-facing work and the product context.",
      doNotClaim:
        "Do not present the personal DeFi project as production work.",
    },
    {
      title: "End-to-end collaboration",
      evidenceIds: ["ev-2"],
      requirementIds: ["req-2", "req-3"],
      rationale: "It maps to two core responsibilities.",
      angle:
        "Explain how you partnered with product and design through release.",
      doNotClaim: "Do not add outcomes that are not in the source material.",
    },
  ],
  questions: [
    {
      question:
        "How did you take a customer-facing React feature from discovery through release?",
      whyThisMayBeAsked: "The role requires end-to-end ownership.",
      requirementIds: ["req-3"],
      evidenceIds: ["ev-2"],
      preparationNote:
        "Start with the Northstar example and stay within the stated evidence.",
      type: "evidence_deep_dive",
    },
    {
      question: "Are you able to work from Singapore three days a week?",
      whyThisMayBeAsked: "This is an explicit location constraint.",
      requirementIds: ["req-6"],
      evidenceIds: [],
      preparationNote:
        "Prepare an honest availability answer; the profile contains no evidence either way.",
      type: "constraint_clarification",
    },
  ],
};

const zhSample = {
  evidenceClaims: [
    "为 B2B 数据分析平台交付 React 和 TypeScript 功能。",
    "与产品和设计团队协作，负责从发现到发布的功能交付。",
    "使用 Next.js、TypeScript 和 viem 构建个人 DeFi 仪表盘。",
  ],
  requirementLabels: {
    "req-1": "生产环境 React 和 TypeScript 界面",
    "req-2": "与产品和设计团队紧密协作",
    "req-3": "端到端负责功能交付",
    "req-4": "钱包集成",
    "req-5": "GraphQL",
    "req-6": "每周三天在新加坡办公",
  },
  matchCopy: {
    "req-1": { rationale: "两项指定技术均有直接的生产环境证据。" },
    "req-2": { rationale: "证据明确提到与产品和设计团队协作。" },
    "req-3": { rationale: "证据明确描述了端到端负责。" },
    "req-4": {
      gap: "缺少生产环境语境的证据。",
      rationale: "存在相关的钱包开发经验。",
    },
    "req-5": { gap: "没有 GraphQL 相关证据。", rationale: null },
    "req-6": { gap: "未提供地点可用性信息。", rationale: null },
  },
  constraint: "资料没有说明 Maya 是否能每周三天在新加坡办公。",
  reasons: [
    "生产环境 React 和 TypeScript 证据支持核心工程要求。",
    "证据显示与产品和设计团队直接协作，并具备端到端负责经验。",
    "职位要求在新加坡办公，但尚无相关证据，因此需要先确认。",
  ],
  emphasis: [
    {
      title: "生产环境 React 与 TypeScript 交付",
      rationale: "它直接支持一项核心要求。",
      angle: "重点说明已交付的面向客户功能及其产品语境。",
      doNotClaim: "不要把个人 DeFi 项目表述成生产环境工作。",
    },
    {
      title: "端到端协作",
      rationale: "它对应两项核心职责。",
      angle: "说明如何与产品和设计团队协作直至发布。",
      doNotClaim: "不要补充原始材料中没有的成果。",
    },
  ],
  questions: [
    {
      question: "你如何将一个面向客户的 React 功能从发现阶段推进到发布？",
      whyThisMayBeAsked: "该职位要求端到端负责。",
      preparationNote: "从 Northstar 的案例开始，并严格依据已有证据回答。",
    },
    {
      question: "你是否能每周三天在新加坡办公？",
      whyThisMayBeAsked: "这是明确的地点限制。",
      preparationNote: "准备诚实说明可用性；资料没有任何一方的证据。",
    },
  ],
};

export function sampleProfileForLanguage(
  outputLanguage: OutputLanguage,
): CandidateProfile {
  if (outputLanguage === "en") return sampleProfile;
  return {
    ...sampleProfile,
    evidence: sampleProfile.evidence.map((item, index) => ({
      ...item,
      claim: zhSample.evidenceClaims[index] ?? item.claim,
    })),
  };
}

export function sampleAnalysisForLanguage(
  outputLanguage: OutputLanguage,
): Analysis {
  if (outputLanguage === "en") return sampleAnalysis;
  const profile = sampleProfileForLanguage(outputLanguage);
  return {
    ...sampleAnalysis,
    profileSnapshot: {
      ...sampleAnalysis.profileSnapshot,
      evidence: profile.evidence,
    },
    requirements: sampleAnalysis.requirements.map((item) => ({
      ...item,
      label:
        zhSample.requirementLabels[
          item.id as keyof typeof zhSample.requirementLabels
        ] ?? item.label,
    })),
    matches: sampleAnalysis.matches.map((item) => ({
      ...item,
      ...zhSample.matchCopy[
        item.requirementId as keyof typeof zhSample.matchCopy
      ],
    })),
    constraints: sampleAnalysis.constraints.map((item) => ({
      ...item,
      detail: zhSample.constraint,
    })),
    reasons: zhSample.reasons,
    emphasis: sampleAnalysis.emphasis.map((item, index) => ({
      ...item,
      ...zhSample.emphasis[index],
    })),
    questions: sampleAnalysis.questions.map((item, index) => ({
      ...item,
      ...zhSample.questions[index],
    })),
  };
}
