import { describe, expect, it } from "vitest";
import {
  ProviderResponseError,
  requestStructured,
  resolveProviderConfig,
} from "@/lib/ai/provider";
import { z } from "zod";

const schema = z.object({ value: z.string().min(1) });
const deepSeekEnvironment = {
  AI_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "test-deepseek-key",
  DEEPSEEK_MODEL: "deepseek-v4-pro",
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
    });
  });

  it("selects DeepSeek with its own key, model, and default base URL", () => {
    expect(resolveProviderConfig(deepSeekEnvironment)).toEqual({
      provider: "deepseek",
      apiKey: "test-deepseek-key",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
    });
  });

  it("honors a configured DeepSeek base URL", () => {
    expect(
      resolveProviderConfig({
        ...deepSeekEnvironment,
        DEEPSEEK_BASE_URL: "https://deepseek.example.test",
      }),
    ).toMatchObject({
      provider: "deepseek",
      baseURL: "https://deepseek.example.test",
    });
  });

  it("rejects incomplete DeepSeek configuration", () => {
    expect(() =>
      resolveProviderConfig({
        AI_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "test-key",
      }),
    ).toThrow(/DEEPSEEK_API_KEY and DEEPSEEK_MODEL/);
  });

  it("rejects unsupported providers", () => {
    expect(() => resolveProviderConfig({ AI_PROVIDER: "other" })).toThrow(
      /Unsupported AI provider/,
    );
  });
});

describe("DeepSeek structured output", () => {
  it("uses the DeepSeek config and Zod-validates the JSON response", async () => {
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
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
    });
    expect(receivedRequest).toMatchObject({
      model: "deepseek-v4-pro",
      store: false,
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
    "rejects invalid DeepSeek JSON or schema output: %s",
    async (output) => {
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
                create: async () => ({ output_text: output }),
              },
            }),
          },
        ),
      ).rejects.toBeInstanceOf(ProviderResponseError);
    },
  );
});
