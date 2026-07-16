import { describe, expect, it } from "vitest";

import { parseDisputeInput, parseProposalInput } from "@/lib/resolution/input";

const REQUEST_ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

function proposalForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("outcome", "yes");
  formData.set("explanation", "The airline recorded an 18:04 gate departure.");
  formData.set("evidenceUrl", "https://example.com/flight-status");
  formData.set("requestId", REQUEST_ID);
  for (const [name, value] of Object.entries(overrides)) {
    formData.set(name, value);
  }
  return formData;
}

function disputeForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("reason", "The screenshot shows the pushback time, not the gate departure time.");
  formData.set("evidenceUrl", "");
  formData.set("requestId", REQUEST_ID);
  for (const [name, value] of Object.entries(overrides)) {
    formData.set(name, value);
  }
  return formData;
}

describe("parseProposalInput", () => {
  it("accepts a valid proposal and preserves the evidence link", () => {
    const parsed = parseProposalInput(proposalForm());
    expect(parsed.error).toBe("");
    expect(parsed.data).toMatchObject({
      evidenceUrl: "https://example.com/flight-status",
      outcome: "yes",
      requestId: REQUEST_ID
    });
  });

  it("accepts every documented outcome including NOT READY", () => {
    for (const outcome of ["yes", "no", "cancel", "not_ready"]) {
      expect(parseProposalInput(proposalForm({ outcome })).error).toBe("");
    }
  });

  it("rejects unknown outcomes", () => {
    expect(parseProposalInput(proposalForm({ outcome: "maybe" })).error).toMatch(/YES, NO, CANCEL/);
  });

  it("rejects explanations outside 3-2000 characters", () => {
    expect(parseProposalInput(proposalForm({ explanation: "ok" })).error).toMatch(/3 to 2000/);
    expect(parseProposalInput(proposalForm({ explanation: "x".repeat(2001) })).error).toMatch(/3 to 2000/);
  });

  it("allows empty evidence but rejects non-http links", () => {
    expect(parseProposalInput(proposalForm({ evidenceUrl: "" })).data?.evidenceUrl).toBeNull();
    expect(parseProposalInput(proposalForm({ evidenceUrl: "ftp://example.com" })).error).toMatch(/HTTP/);
    expect(parseProposalInput(proposalForm({ evidenceUrl: "not a url" })).error).toMatch(/HTTP/);
  });

  it("rejects an invalid request id", () => {
    expect(parseProposalInput(proposalForm({ requestId: "nope" })).error).toMatch(/Refresh/);
  });
});

describe("parseDisputeInput", () => {
  it("accepts a valid dispute without evidence", () => {
    const parsed = parseDisputeInput(disputeForm());
    expect(parsed.error).toBe("");
    expect(parsed.data).toMatchObject({ evidenceUrl: null, requestId: REQUEST_ID });
  });

  it("rejects reasons outside 3-2000 characters", () => {
    expect(parseDisputeInput(disputeForm({ reason: "no" })).error).toMatch(/3 to 2000/);
  });

  it("rejects malformed evidence links", () => {
    expect(parseDisputeInput(disputeForm({ evidenceUrl: "javascript:alert(1)" })).error).toMatch(/HTTP/);
  });
});
