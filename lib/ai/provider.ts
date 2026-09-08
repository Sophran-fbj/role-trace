import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const reasoningEfforts = ["none", "low", "high", "max"] as const;

export type AiProvider = "openai" | "deepseek";
export type DeepSeekReasoningEffort = (typeof reasoningEfforts)[number];

export type ProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseURL?: string;
  reasoningEffort?: DeepSeekReasoningEffort;
};

type ProviderEnvironment = Record<string, string | undefined>;
type StructuredClient = {
  responses: {
    parse: (request: unknown) => Promise<{ output_parsed?: unknown }>;
    create: (
      request: unknown,
    ) => Promise<{ output_text?: string; output?: unknown }>;
  };
};

export type StructuredRequestOptions = {
  environment?: ProviderEnvironment;
  createClient?: (config: ProviderConfig) => StructuredClient;
};

export class ProviderUnavailableError extends Error {}
export class ProviderTimeoutError extends Error {}
export class ProviderRateLimitError extends Error {}
export class ProviderResponseError extends Error {}

function resolveTimeoutMs(environment: ProviderEnvironment): number {
  const configured = environment.AI_TIMEOUT_MS?.trim();
  if (!configured) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(configured);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ProviderUnavailableError(
      "AI_TIMEOUT_MS must be a positive whole number of milliseconds.",
    );
  }
  return timeoutMs;
}

function resolveDeepSeekReasoningEffort(
  environment: ProviderEnvironment,
): DeepSeekReasoningEffort {
  const configured = environment.DEEPSEEK_REASONING_EFFORT?.trim() || "none";
  if (!reasoningEfforts.includes(configured as DeepSeekReasoningEffort)) {
    throw new ProviderUnavailableError(
      "DEEPSEEK_REASONING_EFFORT must be one of: none, low, high, max.",
    );
  }
  return configured as DeepSeekReasoningEffort;
}

export function resolveProviderConfig(
  environment: ProviderEnvironment = process.env,
): ProviderConfig {
  const selected = (environment.AI_PROVIDER ?? "openai").trim().toLowerCase();
  const timeoutMs = resolveTimeoutMs(environment);

  if (selected === "openai") {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    const model = environment.OPENAI_MODEL?.trim();
    if (!apiKey || !model) {
      throw new ProviderUnavailableError(
        "OpenAI is not configured. Add OPENAI_API_KEY and OPENAI_MODEL on the server, or use Sample Mode.",
      );
    }
    return { provider: "openai", apiKey, model, timeoutMs };
  }

  if (selected === "deepseek") {
    const apiKey = environment.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ProviderUnavailableError(
        "DeepSeek is not configured. Add DEEPSEEK_API_KEY on the server, or use Sample Mode.",
      );
    }
    return {
      provider: "deepseek",
      apiKey,
      model: environment.DEEPSEEK_MODEL?.trim() || DEEPSEEK_DEFAULT_MODEL,
      baseURL:
        environment.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE_URL,
      reasoningEffort: resolveDeepSeekReasoningEffort(environment),
      timeoutMs,
    };
  }

  throw new ProviderUnavailableError(
    "Unsupported AI provider. Set AI_PROVIDER to 'openai' or 'deepseek'.",
  );
}

export function getProviderMetadata(
  environment: ProviderEnvironment = process.env,
) {
  const { provider, model } = resolveProviderConfig(environment);
  return { provider, model };
}

function defaultClient(config: ProviderConfig): StructuredClient {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    timeout: config.timeoutMs,
    maxRetries: 0,
  }) as unknown as StructuredClient;
}

function outputText(response: {
  output_text?: string;
  output?: unknown;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (
        !item ||
        typeof item !== "object" ||
        !("content" in item) ||
        !Array.isArray(item.content)
      )
        continue;
      const text = item.content.find(
        (part: unknown) =>
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "output_text" &&
          "text" in part &&
          typeof part.text === "string",
      )?.text;
      if (text) return text;
    }
  }
  throw new ProviderResponseError(
    "The AI provider returned no structured output.",
  );
}

function isStructuredOutputError(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    error instanceof ProviderResponseError
  );
}

function providerFailure(error: unknown): Error {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  if (status === 429) return new ProviderRateLimitError("AI provider rate limited");
  if (status === 408 || status === 504 || name.includes("timeout")) {
    return new ProviderTimeoutError("AI provider timed out");
  }
  return new ProviderUnavailableError("AI provider unavailable");
}

export async function requestStructured<T>(
  params: {
    name: string;
    schema: z.ZodType<T>;
    instructions: string;
    input: unknown;
  },
  options: StructuredRequestOptions = {},
): Promise<T> {
  const config = resolveProviderConfig(options.environment);
  const client = (options.createClient ?? defaultClient)(config);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (config.provider === "openai") {
        const response = await client.responses.parse({
          model: config.model,
          store: false,
          instructions: params.instructions,
          input: JSON.stringify(params.input),
          text: { format: zodTextFormat(params.schema, params.name) },
        });
        if (!response.output_parsed) {
          throw new ProviderResponseError(
            "The AI provider returned no structured output.",
          );
        }
        return params.schema.parse(response.output_parsed);
      }

      const response = await client.responses.create({
        model: config.model,
        store: false,
        instructions: params.instructions,
        input: JSON.stringify(params.input),
        reasoning: { effort: config.reasoningEffort },
        text: {
          format: {
            type: "json_schema",
            name: params.name,
            schema: z.toJSONSchema(params.schema),
          },
        },
      });
      return params.schema.parse(JSON.parse(outputText(response)));
    } catch (error) {
      if (!isStructuredOutputError(error)) {
        throw providerFailure(error);
      }
      if (attempt === 1) {
        throw new ProviderResponseError(
          "The AI provider returned an invalid structured response after one retry.",
        );
      }
    }
  }

  throw new ProviderResponseError(
    "The AI provider returned an invalid structured response after one retry.",
  );
}
