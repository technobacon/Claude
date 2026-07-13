import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketWizard } from "./market-wizard";

const actions = vi.hoisted(() => ({
  createMarketAction: vi.fn(),
  updateMarketAction: vi.fn()
}));

vi.mock("@/app/groups/[groupId]/markets/actions", () => ({
  createMarketAction: actions.createMarketAction,
  updateMarketAction: actions.updateMarketAction
}));

const requestIds = {
  creation: "10000000-0000-4000-8000-000000000001",
  mutation: "10000000-0000-4000-8000-000000000002",
  publish: "10000000-0000-4000-8000-000000000003"
};

const editValues = {
  cancelCondition: "Cancel if the official result is unavailable after 24 hours.",
  creatorCanParticipate: true,
  noCondition: "NO if the official result does not meet the threshold.",
  outcomeControl: "independent" as const,
  question: "Will Team Violet meet the official threshold tomorrow?",
  resolutionEligibleLocal: "2030-07-13T20:00",
  resolutionMode: "disputable" as const,
  resolutionSourceText: "The official event result page.",
  resolutionSourceUrl: "https://example.com/results",
  templateKey: "sports" as const,
  timezone: "UTC",
  tradingClosesLocal: "2030-07-13T18:00",
  yesCondition: "YES if the official result meets the threshold."
};

describe("MarketWizard", () => {
  beforeEach(() => {
    actions.createMarketAction.mockReset();
    actions.updateMarketAction.mockReset();
    actions.createMarketAction.mockResolvedValue({
      attempt: 1,
      error: "",
      nextMutationRequestId: null,
      nextPublishRequestId: null,
      revision: null,
      step: 4
    });
    actions.updateMarketAction.mockResolvedValue({
      attempt: 1,
      error: "",
      nextMutationRequestId: null,
      nextPublishRequestId: null,
      revision: 2,
      step: 4
    });
  });

  it("moves through four steps, keeps template values, and shows an explicit timezone preview", () => {
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: /Flight/ }));
    expect(screen.getByLabelText("Binary question")).toHaveValue(
      "Will flight {number} record an actual gate-departure time no later than {time, date, and timezone}?"
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Make every outcome understandable." })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Trading closes"), { target: { value: "2030-07-13T18:00" } });
    fireEvent.change(screen.getByLabelText("Earliest resolution"), { target: { value: "2030-07-13T20:00" } });
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/Budapest" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Confirm the contract before sharing." })).toBeVisible();
    expect(screen.getByText("Template details remain")).toBeVisible();
    expect(screen.getAllByText("Europe/Budapest").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Will flight/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Binary question")).toHaveValue(
      "Will flight {number} record an actual gate-departure time no later than {time, date, and timezone}?"
    );
  });

  it("submits the selected draft intent with the full controlled contract", async () => {
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: /Sports/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Trading closes"), { target: { value: "2030-07-13T18:00" } });
    fireEvent.change(screen.getByLabelText("Earliest resolution"), { target: { value: "2030-07-13T20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completed draft" }));

    await waitFor(() => expect(actions.createMarketAction).toHaveBeenCalledTimes(1));
    const formData = actions.createMarketAction.mock.calls[0][2] as FormData;
    expect(formData.get("intent")).toBe("draft");
    expect(formData.get("templateKey")).toBe("sports");
    expect(formData.get("creatorCanParticipate")).toBe("true");
    expect(formData.get("question")).toContain("team or driver");
  });

  it("blocks step navigation until the visible contract fields are complete", () => {
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("between 8 and 240 characters");
    expect(screen.getByRole("heading", { name: "What should the group forecast?" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Review/ })).toBeDisabled();
  });

  it("validates an optional URL before leaving Define even though every step remains mounted", () => {
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: /Sports/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Source link/), { target: { value: "https://." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent("valid HTTP or HTTPS URL");
    expect(screen.getByRole("heading", { name: "Make every outcome understandable." })).toBeVisible();
  });

  it("returns to the server-reported step and clears the stale error after correction", async () => {
    actions.createMarketAction.mockResolvedValueOnce({
      attempt: 1,
      error: "The evidence source needs review.",
      nextMutationRequestId: null,
      nextPublishRequestId: null,
      revision: null,
      step: 2
    });
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: /Sports/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Trading closes"), { target: { value: "2030-07-13T18:00" } });
    fireEvent.change(screen.getByLabelText("Earliest resolution"), { target: { value: "2030-07-13T20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish market" }));

    const defineHeading = await screen.findByRole("heading", { name: "Make every outcome understandable." });
    expect(defineHeading).toBeVisible();
    await waitFor(() => expect(defineHeading).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("evidence source needs review");

    fireEvent.change(screen.getByLabelText("Evidence source or observation method"), {
      target: { value: "The corrected official event result page." }
    });
    expect(screen.queryByText("The evidence source needs review.")).not.toBeInTheDocument();
  });

  it("lets Back dismiss a server-pinned step and clears its local error state", async () => {
    actions.createMarketAction.mockResolvedValueOnce({
      attempt: 1,
      error: "The evidence source needs review.",
      nextMutationRequestId: null,
      nextPublishRequestId: null,
      revision: null,
      step: 2
    });
    render(<MarketWizard groupId="group-one" requestIds={requestIds} />);

    fireEvent.click(screen.getByRole("button", { name: /Sports/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Trading closes"), { target: { value: "2030-07-13T18:00" } });
    fireEvent.change(screen.getByLabelText("Earliest resolution"), { target: { value: "2030-07-13T20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish market" }));

    expect(await screen.findByText("The evidence source needs review.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "What should the group forecast?" })).toBeVisible();
    expect(screen.queryByText("The evidence source needs review.")).not.toBeInTheDocument();
  });

  it("retries unchanged publish failures with the returned revision and replacement request IDs", async () => {
    const nextMutationRequestId = "10000000-0000-4000-8000-000000000004";
    const nextPublishRequestId = "10000000-0000-4000-8000-000000000005";
    actions.updateMarketAction.mockReset();
    actions.updateMarketAction
      .mockResolvedValueOnce({
        attempt: 1,
        error: "Your changes were saved as a draft, but the market could not be published.",
        nextMutationRequestId,
        nextPublishRequestId,
        revision: 2,
        step: 4
      })
      .mockResolvedValueOnce({
        attempt: 2,
        error: "",
        nextMutationRequestId: null,
        nextPublishRequestId: null,
        revision: 3,
        step: 4
      });
    render(
      <MarketWizard
        groupId="group-one"
        initialValues={editValues}
        marketId="market-one"
        requestIds={requestIds}
        revision={1}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish market" }));
    expect(await screen.findByText(/saved as a draft/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Publish market" }));
    await waitFor(() => expect(actions.updateMarketAction).toHaveBeenCalledTimes(2));
    const retryFormData = actions.updateMarketAction.mock.calls[1][3] as FormData;
    expect(retryFormData.get("expectedRuleRevision")).toBe("2");
    expect(retryFormData.get("mutationRequestId")).toBe(nextMutationRequestId);
    expect(retryFormData.get("publishRequestId")).toBe(nextPublishRequestId);
  });
});
