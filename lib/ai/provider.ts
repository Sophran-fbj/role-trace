import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";

export type AiProvider = "openai" | "deepseek";

export type ProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseURL?: string;
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
export class ProviderResponseError extends Error {}

export function resolveProviderConfig(
  environment: ProviderEnvironment = process.env,
): ProviderConfig {
  const selected = (environment.AI_PROVIDER ?? "openai").trim().toLowerCase();

  if (selected === "openai") {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    const model = environment.OPENAI_MODEL?.trim();
    if (!apiKey || !model) {
      throw new ProviderUnavailableError(
        "OpenAI is not configured. Add OPENAI_API_KEY and OPENAI_MODEL on the server, or use Sample Mode.",
      );
    }
    return { provider: "openai", apiKey, model };
  }

  if (selected === "deepseek") {
    const apiKey = environment.DEEPSEEK_API_KEY?.trim();
    const model = environment.DEEPSEEK_MODEL?.trim();
    if (!apiKey || !model) {
      throw new ProviderUnavailableError(
        "DeepSeek is not configured. Add DEEPSEEK_API_KEY and DEEPSEEK_MODEL on the server, or use Sample Mode.",
      );
    }
    return {
      provider: "deepseek",
      apiKey,
      model,
      baseURL:
        environment.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE_URL,
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
    timeout: 25_000,
    maxRetries: 0,
  }) as unknown as StructuredClient;
}

function outputText(response: {
  output_text?: string;
  output?: unknown;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim())
    return response.output_text;
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
  let lastError: unknown;

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
        if (!response.output_parsed)
          throw new ProviderResponseError(
            "The AI provider returned no structured output.",
          );
        return params.schema.parse(response.output_parsed);
      }

      // DeepSeek documents `responses.create` with `text.format.json_schema`, but does not
      // document compatibility with the OpenAI SDK's `responses.parse` helper.
      const response = await client.responses.create({
        model: config.model,
        store: false,
        instructions: params.instructions,
        input: JSON.stringify(params.input),
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
      lastError = error;
    }
  }

  if (
    lastError instanceof z.ZodError ||
    lastError instanceof SyntaxError ||
    lastError instanceof ProviderResponseError
  ) {
    throw new ProviderResponseError(
      "The AI provider returned an invalid structured response after one retry.",
    );
  }
  throw new ProviderUnavailableError(
    "The AI provider could not complete the request. Your input was not changed; please retry.",
  );
}
