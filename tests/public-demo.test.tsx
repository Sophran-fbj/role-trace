// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench";

describe("public Sample Mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });
  afterEach(() => cleanup());

  it("shows the public-demo notice and routes Profile users to Sample Mode without calling evidence extraction", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Workbench />);

    expect(screen.getByText("This is a public sample site. Real AI extraction and analysis are not available here.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getByText("This is a public sample site. Real AI extraction and analysis are not available here.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Extract evidence" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "View Sample Mode" }));
    await waitFor(() => expect(screen.getByText(/SAMPLE MODE/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps evidence extraction available when real AI is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          sourceBlocks: [{ id: "resume:block:1", documentId: "resume", index: 0, text: "Built React features." }],
          evidence: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Workbench realAiEnabled />);

    await user.click(screen.getByRole("button", { name: "Profile" }));
    await user.type(screen.getByLabelText("Resume text"), "Built React features.");
    await user.click(screen.getByRole("button", { name: "Extract evidence" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/evidence/extract");
  });
});
