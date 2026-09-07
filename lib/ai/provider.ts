import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export class ProviderUnavailableError extends Error {}
export class ProviderResponseError extends Error {}

function requireConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) throw new ProviderUnavailableError("AI analysis is not configured. Add OPENAI_API_KEY and OPENAI_MODEL on the server, or use Sample Mode.");
  return { apiKey, model };
}

export async function requestStructured<T>(params: { name: string; schema: z.ZodType<T>; instructions: string; input: unknown }): Promise<T> {
  const { apiKey, model } = requireConfig();
  const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.responses.parse({
        model,
        store: false,
        instructions: params.instructions,
        input: JSON.stringify(params.input),
        text: { format: zodTextFormat(params.schema, params.name) },
      });
      if (!response.output_parsed) throw new ProviderResponseError("The AI provider returned no structured output.");
      return params.schema.parse(response.output_parsed);
    } catch (error) {
      lastError = error;
      if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof ProviderResponseError) continue;
      if (attempt === 1) break;
    }
  }
  if (lastError instanceof z.ZodError || lastError instanceof SyntaxError || lastError instanceof ProviderResponseError) throw new ProviderResponseError("The AI provider returned an invalid structured response after one retry.");
  throw new ProviderUnavailableError("The AI provider could not complete the request. Your input was not changed; please retry.");
}
