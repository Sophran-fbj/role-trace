// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Workbench } from "@/components/workbench";

describe("Evidence review editing", () => {
  beforeEach(() => window.localStorage.clear());

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
    expect((screen.getByLabelText("Source block (read-only)") as HTMLInputElement).readOnly).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save edit" }));

    expect(screen.getByText("Edited customer-facing React delivery")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });
});
