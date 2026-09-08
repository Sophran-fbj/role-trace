import { describe, expect, it } from "vitest";
import {
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  requestStructured,
  resolveProviderConfig,
} from "@/lib/ai/provider";
import { z } from "zod";

const schema = z.object({ value: z.string().min(1) });
const deepSeekEnvironment = {
  AI_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "test-deepseek-key",
};

describe("AI provider configuration", () => {
  it("defaults to OpenAI when AI_PROVIDER is unset", () => {
    expect(
      resolveProviderConfig({
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_MODEL: "gpt-test",
      }),
    ).toEqual({
      provider: "openai",
      apiKey: "test-openai-key",
      model: "gpt-test",
      timeoutMs: 20_000,
    });
  });

  it("defaults DeepSeek to flash, no reasoning, and the official base URL", () => {
    expect(resolveProviderConfig(deepSeekEnvironment)).toEqual({
      provider: "deepseek",
      apiKey: "test-deepseek-key",
      model: "deepseek-v4-flash",
      baseURL: "https://api.deepseek.com",
      reasoningEffort: "none",
      timeoutMs: 20_000,
    });
  });

  it("honors explicit DeepSeek model, reasoning effort, base URL, and timeout", () => {
    expect(
      resolveProviderConfig({
        ...deepSeekEnvironment,
        DEEPSEEK_MODEL: "deepseek-v4-pro",
        DEEPSEEK_REASONING_EFFORT: "high",
        DEEPSEEK_BASE_URL: "https://deepseek.example.test",
        AI_TIMEOUT_MS: "15000",
      }),
    ).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
      baseURL: "https://deepseek.example.test",
      timeoutMs: 15_000,
    });
  });

  it("rejects DeepSeek without its key", () => {
    expect(() => resolveProviderConfig({ AI_PROVIDER: "deepseek" })).toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });

  it("rejects invalid DeepSeek reasoning effort and timeout", () => {
    expect(() =>
      resolveProviderConfig({
        ...deepSeekEnvironment,
        DEEPSEEK_REASONING_EFFORT: "medium",
      }),
    ).toThrow(/DEEPSEEK_REASONING_EFFORT/);
    expect(() =>
      resolveProviderConfig({ ...deepSeekEnvironment, AI_TIMEOUT_MS: "0" }),
    ).toThrow(/AI_TIMEOUT_MS/);
  });

  it("rejects unsupported providers", () => {
    expect(() => resolveProviderConfig({ AI_PROVIDER: "other" })).toThrow(
      /Unsupported AI provider/,
    );
  });
});

describe("DeepSeek structured output", () => {
  it("uses the DeepSeek config, explicit reasoning, and Zod-validates JSON", async () => {
    let receivedConfig: unknown;
    let receivedRequest: unknown;
    const result = await requestStructured(
      {
        name: "test_output",
        schema,
        instructions: "Return structured data.",
        input: { test: true },
      },
      {
        environment: deepSeekEnvironment,
        createClient: (config) => {
          receivedConfig = config;
          return {
            responses: {
              parse: async () => ({ output_parsed: undefined }),
              create: async (request) => {
                receivedRequest = request;
                return { output_text: '{"value":"valid"}' };
              },
            },
          };
        },
      },
    );
    expect(receivedConfig).toEqual({
      provider: "deepseek",
      apiKey: "test-deepseek-key",
      model: "deepseek-v4-flash",
      baseURL: "https://api.deepseek.com",
      reasoningEffort: "none",
      timeoutMs: 20_000,
    });
    expect(receivedRequest).toMatchObject({
      model: "deepseek-v4-flash",
      store: false,
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          name: "test_output",
        },
      },
    });
    expect(result).toEqual({ value: "valid" });
  });

  it.each(["not json", '{"value":""}'])(
    "retries once then rejects invalid structured output: %s",
    async (output) => {
      let calls = 0;
      await expect(
        requestStructured(
          {
            name: "test_output",
            schema,
            instructions: "Return structured data.",
            input: {},
          },
          {
            environment: deepSeekEnvironment,
            createClient: () => ({
              responses: {
                parse: async () => ({ output_parsed: undefined }),
                create: async () => {
                  calls += 1;
                  return { output_text: output };
                },
              },
            }),
          },
        ),
      ).rejects.toBeInstanceOf(ProviderResponseError);
      expect(calls).toBe(2);
    },
  );

  it("does not application-retry provider failures", async () => {
    let calls = 0;
    await expect(
      requestStructured(
        {
          name: "test_output",
          schema,
          instructions: "Return structured data.",
          input: {},
        },
        {
          environment: deepSeekEnvironment,
          createClient: () => ({
            responses: {
              parse: async () => ({ output_parsed: undefined }),
              create: async () => {
                calls += 1;
                throw new Error("network unavailable");
              },
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls).toBe(1);
  });

  it("classifies provider timeouts and rate limits without retrying", async () => {
    const request = (failure: Error) => requestStructured(
      { name: "test_output", schema, instructions: "Return structured data.", input: {} },
      { environment: deepSeekEnvironment, createClient: () => ({ responses: { parse: async () => ({ output_parsed: undefined }), create: async () => { throw failure; } } }) },
    );
    await expect(request(Object.assign(new Error("slow"), { name: "TimeoutError" }))).rejects.toBeInstanceOf(ProviderTimeoutError);
    await expect(request(Object.assign(new Error("busy"), { status: 429 }))).rejects.toBeInstanceOf(ProviderRateLimitError);
  });
});
