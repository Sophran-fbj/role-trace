// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Workbench } from "@/components/workbench";
import { languageStorageKey } from "@/lib/i18n";

describe("Workbench language switch", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a Chinese selection and localizes Sample Mode generated fields", async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "中文" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "资料" })).toBeTruthy();
    });
    expect(window.localStorage.getItem(languageStorageKey)).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");

    await user.click(screen.getByRole("button", { name: "查看示例" }));

    expect(screen.getByText("生产环境 React 和 TypeScript 界面")).toBeTruthy();
    expect(screen.getByText("建议依据")).toBeTruthy();
  });
});
