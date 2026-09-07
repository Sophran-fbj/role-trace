import { describe, expect, it } from "vitest";
import {
  browserDefaultLanguage,
  getCopy,
  outputLanguageSchema,
} from "@/lib/i18n";
import { sampleAnalysis, sampleAnalysisForLanguage } from "@/fixtures/sample";

describe("language selection", () => {
  it("defaults Chinese browsers to zh-CN and other browsers to English", () => {
    expect(browserDefaultLanguage("zh-CN")).toBe("zh-CN");
    expect(browserDefaultLanguage("zh-Hant-TW")).toBe("zh-CN");
    expect(browserDefaultLanguage("en-US")).toBe("en");
    expect(browserDefaultLanguage(undefined)).toBe("en");
  });

  it("renders enum display labels from the selected typed dictionary", () => {
    expect(getCopy("zh-CN").matchStatuses.strong_match).toBe("强匹配");
    expect(getCopy("en").reviewStates.pending).toBe("Pending");
  });
});

describe("API output language validation", () => {
  it.each(["zh-CN", "en"])("accepts %s", (language) => {
    expect(outputLanguageSchema.safeParse(language).success).toBe(true);
  });

  it("rejects unsupported output languages", () => {
    expect(outputLanguageSchema.safeParse("fr").success).toBe(false);
  });
});

describe("localized sample mode", () => {
  it("localizes generated sample fields without changing source quotes", () => {
    const chinese = sampleAnalysisForLanguage("zh-CN");
    expect(chinese.requirements[0].label).toBe(
      "生产环境 React 和 TypeScript 界面",
    );
    expect(chinese.reasons[0]).toContain("证据支持");
    expect(chinese.profileSnapshot.evidence[0].claim).toContain("交付");
    expect(chinese.requirements[0].sources[0].exactQuote).toBe(
      sampleAnalysis.requirements[0].sources[0].exactQuote,
    );
    expect(chinese.profileSnapshot.evidence[0].exactQuote).toBe(
      sampleAnalysis.profileSnapshot.evidence[0].exactQuote,
    );
  });
});
