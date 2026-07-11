import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoMarket } from "./demo-market";

describe("DemoMarket", () => {
  it("moves the visible market after a demo position", () => {
    render(<DemoMarket />);

    expect(screen.getByText("60%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "100" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit 100 points to YES" }));

    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("100 demo points committed to YES. The market moved.")).toBeInTheDocument();
  });
});
