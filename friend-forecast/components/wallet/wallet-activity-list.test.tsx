import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalletActivityList } from "./wallet-activity-list";

describe("WalletActivityList", () => {
  it("renders fixed labels and signed credit/debit amounts", () => {
    render(
      <WalletActivityList
        activity={[
          {
            amount: 1000,
            createdAt: "2026-07-12T10:00:00.000Z",
            id: "one",
            idempotencyKey: "opening",
            type: "opening_grant"
          },
          {
            amount: -75,
            createdAt: "2026-07-13T10:00:00.000Z",
            id: "two",
            idempotencyKey: "position",
            type: "position_debit"
          }
        ]}
      />
    );

    expect(screen.getByText("Opening grant")).toBeInTheDocument();
    expect(screen.getByText("+1,000")).toHaveClass("amount-positive");
    expect(screen.getByText("Position committed")).toBeInTheDocument();
    expect(screen.getByText("−75")).toHaveClass("amount-negative");
  });

  it("renders an explicit empty state", () => {
    render(<WalletActivityList activity={[]} />);
    expect(screen.getByText("No wallet activity yet.")).toBeInTheDocument();
  });
});
