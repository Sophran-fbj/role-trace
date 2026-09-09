# RoleTrace

RoleTrace 是一个面向求职者的、本地优先的职位分析作品：**基于真实证据的岗位匹配分析**（Evidence-grounded job fit analysis）。它把简历和项目材料中的**可追溯证据**映射到 JD 要求，帮助用户决定是否投递、应强调什么，以及还需要确认哪些条件；它不是 ATS，也不会自动投递。

## 产品流程

1. 创建真实 Profile：粘贴简历和最多 5 个项目说明。
2. 服务端提取 Evidence；每条 evidence 都保留只读的原文引用和来源块。
3. 用户可验证、编辑或排除 evidence，然后保存到当前浏览器。
4. 粘贴 JD，得到不可变的 Analysis 快照和可修改的本地求职状态。
5. 在报告中查看 requirement、证据来源、硬性条件、结论及准备建议；可导出本地备份。

公开站点默认也可以完整浏览 **Sample Mode**，不需要 API Key，也不会发起真实模型请求。

## Evidence-grounded 设计

模型只负责提出结构化候选项。普通 TypeScript 代码会再次校验 source block、exact quote、evidence ID、review state、relationship、年限和硬性条件；无效或不足的证据会被降级。Recommendation 同样由确定性规则计算，模型不能直接输出“申请/跳过”结论。

- 用户原始材料、JD 原文和 exact quote 从不翻译或改写。
- 个人项目不会被升级成生产经验。
- Analysis 保存的是当时的 Profile snapshot；后续修改 Profile 不会改写旧报告。
- 所有浏览器备份仅包含本地 Profile、分析和求职状态，绝不包含环境变量或 API Key。

## 为什么没有 RAG、向量数据库或 Agent

MVP 的材料量很小，且每个面向用户的判断都需要回到明确的原文。直接保留 source blocks 和 exact quotes 比检索链路更可审计、更易测试，也避免增加隐私、成本与运行复杂度。项目没有 Agent、向量数据库、数据库、登录、云同步或自动投递。

## 技术架构

- Next.js App Router、React、TypeScript strict、Zod
- OpenAI SDK：OpenAI Responses `responses.parse`；DeepSeek Responses 使用显式 JSON Schema、JSON.parse 和 Zod 校验
- `store: false` 用于模型请求；API Key 只在服务端读取
- localStorage + 有版本的 Zod schema migration，用于 Profile、Analysis、TrackedApplication 和 JSON 备份；旧品牌的本地数据和备份会在验证后兼容导入
- Vitest 单元/集成测试 + Playwright happy path

## 本地启动

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local` 被 git 忽略。默认 `ENABLE_REAL_AI=false`，此时仅 Sample Mode 可用；这也是建议的公开演示默认值。

## DeepSeek 配置

在 `.env.local` 中填写（不要提交该文件）：

```dotenv
ENABLE_REAL_AI=true
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-server-only-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_REASONING_EFFORT=none
AI_TIMEOUT_MS=20000
```

DeepSeek Key 仅由服务端 provider adapter 读取，并只发送到 `https://api.deepseek.com`（或你明确配置的 DeepSeek base URL）。不要使用 `NEXT_PUBLIC_` 前缀存放任何密钥。若使用 OpenAI，设置 `AI_PROVIDER=openai`、`OPENAI_API_KEY` 和 `OPENAI_MODEL`；其余流程保持一致。

## 演示模式与真实 AI 模式

| 模式 | `ENABLE_REAL_AI` | 行为 |
| --- | --- | --- |
| 公开演示（默认） | 未设置或 `false` | 可完整查看内置示例；真实提取/分析在服务端返回友好说明，不消耗站长 Key。 |
| 自托管/受控真实 AI | `true` | 服务端允许真实 evidence extraction 和 JD analysis；操作者负责 Key、预算和访问控制。 |

环境开关在服务端 API 路由再次校验，不能通过浏览器改写 UI 状态来绕过。

## Vercel 环境变量

为公开作品站建议只配置：

```dotenv
ENABLE_REAL_AI=false
```

若你有明确的成本和访问控制方案，才额外配置：

```dotenv
ENABLE_REAL_AI=true
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_REASONING_EFFORT=none
AI_TIMEOUT_MS=20000
```

或改为 OpenAI 的 `AI_PROVIDER=openai`、`OPENAI_API_KEY`、`OPENAI_MODEL`。这些均应只在 Vercel 的 server environment 中填写，绝不能提交到 Git 或配置为 `NEXT_PUBLIC_*`。本仓库没有 `vercel.json`，可以直接从 Git 导入项目；本次没有执行登录或正式部署。

## 测试

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

Playwright 使用路由 mock 覆盖 AI 请求，因此不调用真实模型或计费。其 web server 显式开启测试用 feature flag，仅用于覆盖真实 Profile 的完整 happy path。

## Recommendation 与 Eval

Recommendation 是可解释的产品启发式，而不是录用概率：Strong Match 权重为 1，Partial Match 权重为 0.5；confirmed blocker 直接为 Skip，未解决的 hard constraint 为 Need More Information。Apply 需要 core requirements 的加权支持至少 0.8，且至少一半为 Strong；其余有有效支持的情况可为 Consider。当前阈值是刻意保守的策略，未在本轮修改。

`evals/cases.ts` 包含匿名合成 case，覆盖 React/TypeScript、Vue、Next.js、wagmi/viem、Vitest/React Testing Library、TanStack Query、年限不足、无证据、授权未知、明确 blocker 与 JD prompt injection。`evals/scorer.ts` 聚合 requirement recall、quote validity、evidence quote recall、status agreement、false Strong、false Partial、unsupported match、invalid evidence ID，以及 blocker 的 TP/TN/FP/FN、recall/precision 与 recommendation agreement。`npm test` 只运行固定输出的 scorer 测试，不会调用模型。要显式运行真实 pipeline 的 live eval（会产生模型费用），请在受控本地环境设置有效的 server-side provider 配置后运行：

```powershell
$env:RUN_LIVE_EVAL = "true"
$env:ENABLE_REAL_AI = "true"
$env:WRITE_EVAL_REPORT = "true" # Optional: writes a gitignored JSON report under eval-results/
npm test -- tests/live-evals.test.ts
```

`RUN_LIVE_EVAL` 未设置时该测试会跳过。完整 live eval 每次最多并发两个 case，并输出 provider/model、逐 case 指标和汇总；不会输出 Key、完整环境变量或源材料。任何 pipeline case 失败都会使 eval 失败。门槛为：quote validity 100%、evidence quote recall ≥90%、invalid evidence ID 0、unsupported match（含 false Strong/Partial）0、明确 blocker recall 100%、false blocker 0、requirement recall ≥90%、status agreement ≥80%、recommendation agreement ≥80%。报告只含 case ID、指标、provider/model、耗时，以及安全的失败 stage、error name 和固定诊断文案，`eval-results/` 已被 Git 忽略。指标用于发现回归，不代表录用概率。

要诊断少量 case，可显式指定逗号分隔的 ID；这会串行执行，且自动进入 diagnostic mode。子集不会要求 blocker，也不会被标记为完整验收：

```powershell
$env:RUN_LIVE_EVAL = "true"
$env:ENABLE_REAL_AI = "true"
$env:EVAL_CASE_IDS = "wallet-libraries,claim-hallucination"
npm test -- tests/live-evals.test.ts
```

也可设置 `$env:EVAL_DIAGNOSTIC = "true"` 运行诊断模式。诊断模式仍会因 pipeline failure 返回失败，但不会评估完整验收 gates。

## 隐私与安全

- Sample Mode 不发送个人材料。
- 真实模式会将用户主动粘贴的材料发送到所选模型提供商以完成分析；请勿输入不应交给该提供商的数据。
- 本地 Profile、报告、岗位状态和备份保存在浏览器；清除浏览器数据会丢失它们，建议使用 Export data 备份。
- 不记录 API Key、Prompt、简历/JD 原文或模型完整输出到服务端日志。服务端性能日志只含阶段名和耗时。

## 已知限制

- 没有登录、跨设备同步或云端备份。
- 公开演示默认关闭真实 AI；若要开放，请自行增加适合预算与滥用风险的访问控制。
- 年限判断只处理明确、可解析的时长，不推断复杂任职区间重叠。
- 结果是可审阅的求职辅助，不是法律、签证、雇佣资格或职业建议。
