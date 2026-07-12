import { describe, expect, it } from "vitest";

import { parseInvitationInput } from "./input";

function invitationForm(durationDays: string, maximumUses = "") {
  const formData = new FormData();
  formData.set("durationDays", durationDays);
  formData.set("maximumUses", maximumUses);
  return formData;
}

describe("parseInvitationInput", () => {
  it("calculates expiry and optional use limits", () => {
    expect(parseInvitationInput(invitationForm("7", "12"), new Date("2026-07-12T10:00:00.000Z"))).toEqual({
      data: { expiresAt: "2026-07-19T10:00:00.000Z", maximumUses: 12 }
    });
  });

  it("allows unlimited invitations", () => {
    expect(parseInvitationInput(invitationForm("1"), new Date("2026-07-12T10:00:00.000Z"))).toEqual({
      data: { expiresAt: "2026-07-13T10:00:00.000Z", maximumUses: null }
    });
  });

  it("rejects unsupported durations and use limits", () => {
    expect(parseInvitationInput(invitationForm("365"))).toEqual({ error: "Choose a valid invitation duration." });
    expect(parseInvitationInput(invitationForm("7", "101"))).toEqual({
      error: "Maximum uses must be between 1 and 100."
    });
  });
});
