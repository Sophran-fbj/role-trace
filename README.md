# ApplyLens

ApplyLens 是一个面向求职者的、本地优先的职位分析作品。它把简历和项目材料中的**可追溯证据**映射到 JD 要求，帮助用户决定是否投递、应强调什么，以及还需要确认哪些条件；它不是 ATS，也不会自动投递。

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
- localStorage + 有版本的 Zod schema migration，用于 Profile、Analysis、TrackedApplication 和 JSON 备份
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
