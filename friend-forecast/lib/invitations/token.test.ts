import { describe, expect, it } from "vitest";

import { createInvitationToken, hashInvitationToken } from "./token";

describe("invitation tokens", () => {
  it("creates high-entropy URL-safe tokens", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("creates deterministic database-safe hashes without retaining the token", () => {
    const token = "invite-token";
    const hash = hashInvitationToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
  });
});
