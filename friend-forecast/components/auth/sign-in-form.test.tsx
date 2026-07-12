import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";

const { signInWithOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOtp } })
}));

describe("SignInForm", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("requests a magic link with profile metadata and the intended destination", async () => {
    render(<SignInForm nextPath="/groups/one?invite=two" />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Mara" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "mara@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "mara@example.com",
      options: {
        data: { display_name: "Mara" },
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fgroups%2Fone%3Finvite%3Dtwo"
      }
    });
    expect(screen.getByText("Check your inbox")).toBeInTheDocument();
  });

  it("shows a recoverable error when the email cannot be sent", async () => {
    signInWithOtp.mockResolvedValue({ error: new Error("rate limited") });
    render(<SignInForm nextPath="/groups" />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "mara@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the sign-in email. Check the address and try again in a minute."
    );
  });
});
