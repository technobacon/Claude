import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PositionForm } from "./position-form";

const actions = vi.hoisted(() => ({
  commitPositionAction: vi.fn()
}));

vi.mock("@/app/groups/[groupId]/markets/[marketId]/actions", () => ({
  commitPositionAction: actions.commitPositionAction
}));

const baseProps = {
  balance: 800,
  commitRequestId: "10000000-0000-4000-8000-000000000009",
  existingPoints: 0,
  existingSide: null,
  groupId: "group-one",
  marketId: "market-one",
  maxMarketStake: 100,
  minimumPosition: 10,
  noPool: 200,
  yesPool: 300
};

describe("PositionForm", () => {
  beforeEach(() => {
    actions.commitPositionAction.mockReset();
    actions.commitPositionAction.mockResolvedValue({
      attempt: 1,
      error: "",
      nextCommitRequestId: null
    });
  });

  it("previews the projected payout for the selected side and stake", () => {
    render(<PositionForm {...baseProps} />);

    expect(screen.getByTestId("side-yes")).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByTestId("stake-input"), { target: { value: "100" } });
    // 100 + (100 / 400) * 200 = 150
    expect(screen.getByTestId("projected-payout")).toHaveTextContent("150 pts");

    fireEvent.click(screen.getByTestId("side-no"));
    // 100 + (100 / 300) * 300 = 200
    expect(screen.getByTestId("projected-payout")).toHaveTextContent("200 pts");
  });

  it("clamps typed stakes into the wallet and per-market limits", () => {
    render(<PositionForm {...baseProps} balance={42} />);

    fireEvent.change(screen.getByTestId("stake-input"), { target: { value: "500" } });
    expect(screen.getByTestId("stake-input")).toHaveValue(42);

    fireEvent.change(screen.getByTestId("stake-input"), { target: { value: "2" } });
    expect(screen.getByTestId("stake-input")).toHaveValue(10);
  });

  it("locks the side selector to an existing position", () => {
    render(<PositionForm {...baseProps} existingSide="no" existingPoints={40} />);

    expect(screen.getByTestId("side-no")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("side-yes")).toBeDisabled();
    expect(screen.getByText(/already back NO with 40 points/i)).toBeVisible();
  });

  it("requires confirmation before the commitment is submitted", async () => {
    render(<PositionForm {...baseProps} />);

    expect(screen.queryByTestId("confirm-sheet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("review-commit"));
    expect(actions.commitPositionAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-commit"));
    await waitFor(() => expect(actions.commitPositionAction).toHaveBeenCalledTimes(1));

    const formData = actions.commitPositionAction.mock.calls[0][3] as FormData;
    expect(formData.get("side")).toBe("yes");
    expect(formData.get("points")).toBe("10");
    expect(formData.get("commitRequestId")).toBe(baseProps.commitRequestId);
  });

  it("shows the server error and rotates the request id after a failure", async () => {
    actions.commitPositionAction.mockResolvedValue({
      attempt: 1,
      error: "Your wallet has 5 points available.",
      nextCommitRequestId: "10000000-0000-4000-8000-000000000010"
    });
    render(<PositionForm {...baseProps} />);

    fireEvent.click(screen.getByTestId("review-commit"));
    fireEvent.click(screen.getByTestId("confirm-commit"));

    expect(await screen.findByTestId("position-error")).toHaveTextContent("Your wallet has 5 points available.");
    expect(screen.queryByTestId("confirm-sheet")).not.toBeInTheDocument();
    await waitFor(() => {
      const hidden = document.querySelector<HTMLInputElement>("input[name='commitRequestId']");
      expect(hidden?.value).toBe("10000000-0000-4000-8000-000000000010");
    });
  });

  it("explains when the wallet cannot cover the minimum position", () => {
    render(<PositionForm {...baseProps} balance={4} />);

    expect(screen.getByTestId("position-unavailable")).toHaveTextContent(/at least 10 points/);
    expect(screen.queryByTestId("position-form")).not.toBeInTheDocument();
  });

  it("explains when the per-market cap is already reached", () => {
    render(<PositionForm {...baseProps} existingSide="yes" existingPoints={100} />);

    expect(screen.getByTestId("position-unavailable")).toHaveTextContent(/100-point cap/);
  });
});
