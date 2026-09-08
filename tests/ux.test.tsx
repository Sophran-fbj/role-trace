// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench";
import { sampleAnalysis, sampleProfile } from "@/fixtures/sample";
import { saveAnalysis, saveProfile } from "@/lib/persistence/repository";

function saveRealSnapshot(profileUpdatedAt = "2026-09-08T01:00:00.000Z") {
  const profile = { ...sampleProfile, id: "profile-ux", updatedAt: profileUpdatedAt };
  const analysis = {
    ...sampleAnalysis,
    id: "analysis-ux",
    isSample: false,
    profileUpdatedAt: "2026-09-08T00:00:00.000Z",
    profileSnapshot: { ...sampleAnalysis.profileSnapshot, id: profile.id },
  };
  saveProfile(profile);
  saveAnalysis(analysis);
}

describe("V1 UX safeguards", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });
  afterEach(() => cleanup());

  it("disables Analyze with a visible reason when no saved profile exists", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect((screen.getByRole("button", { name: "Analyze job" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Create and save a real profile before analyzing a job.").length).toBeGreaterThan(0);
  });

  it("prevents duplicate analysis requests and supports cancellation", async () => {
    saveRealSnapshot("2026-09-08T00:00:00.000Z");
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Workbench realAiEnabled />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    await user.type(screen.getByLabelText("Job description"), "React is required for this role. ".repeat(5));

    const submit = screen.getByRole("button", { name: "Analyze job" });
    await user.click(submit);
    await user.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("This usually takes about 10–20 seconds.");
    await user.click(screen.getByRole("button", { name: "Cancel analysis" }));
    await waitFor(() => expect(screen.getByText("Analysis cancelled. Your job description was kept so you can retry.")).toBeTruthy());
    expect((screen.getByLabelText("Job description") as HTMLTextAreaElement).value).toBe("React is required for this role. ".repeat(5));
  });

  it("shows profile change warning, filters requirements, and closes the source drawer with Escape", async () => {
    saveRealSnapshot();
    const user = userEvent.setup();
    render(<Workbench />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Applications" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Applications" }));
    await user.click(screen.getByRole("button", { name: "Open report" }));

    expect(screen.getByText("Profile changed since this analysis.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gaps" }));
    expect(screen.getByRole("button", { name: "Gaps" }).getAttribute("aria-pressed")).toBe("true");

    const sourceButton = screen.getAllByRole("button", { name: "View sources" })[0];
    await user.click(sourceButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close source details" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(sourceButton);
  });

  it("shows a local Job URL error and saves after the URL is corrected", async () => {
    saveRealSnapshot("2026-09-08T00:00:00.000Z");
    const user = userEvent.setup();
    render(<Workbench />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Applications" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Applications" }));
    await user.click(screen.getByRole("button", { name: "Open report" }));
    const url = screen.getByLabelText("Job URL");
    await user.type(url, "abc");
    await user.click(screen.getByRole("button", { name: "Save application details" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a complete URL starting with http:// or https://.");
    await user.clear(url);
    await user.type(url, "https://example.com/job");
    await user.click(screen.getByRole("button", { name: "Save application details" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
