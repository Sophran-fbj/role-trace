// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workbench } from "@/components/workbench";
import { sampleProfile } from "@/fixtures/sample";
import { saveProfile } from "@/lib/persistence/repository";

describe("Evidence review editing", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("edits user-correctable fields while preserving read-only source fields", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Try sample" }));
    await user.click(screen.getByRole("button", { name: "Profile" }));
    await user.click(screen.getAllByRole("button", { name: "Edit evidence" })[0]);

    const claim = screen.getByLabelText("Claim");
    await user.clear(claim);
    await user.type(claim, "Edited customer-facing React delivery");
    await user.selectOptions(screen.getByLabelText("Evidence type"), "work_responsibility");
    await user.selectOptions(screen.getByLabelText("Strength"), "transferable");
    expect((screen.getByLabelText("Exact quote (read-only)") as HTMLTextAreaElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Source excerpt (read-only)") as HTMLTextAreaElement).readOnly).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save edit" }));

    expect(screen.getByText("Edited customer-facing React delivery")).toBeTruthy();
    expect(screen.getAllByText("Edited")).not.toHaveLength(0);
  });

  it("requires saving reviewed evidence before analysis and persists the review state", async () => {
    saveProfile({ ...sampleProfile, id: "real-review-profile" });
    const user = userEvent.setup();
    render(<Workbench realAiEnabled />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Profile" }));
    await user.click(screen.getAllByRole("button", { name: "Verify" })[0]);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(screen.getByText("Save your evidence review changes before analyzing.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Profile" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    cleanup();
    render(<Workbench realAiEnabled />);
    const restoredUser = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy());
    await restoredUser.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getAllByText("Verified")).not.toHaveLength(0);
  });
});
