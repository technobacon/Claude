import { describe, expect, it } from "vitest";

import { createAuthCallbackUrl, sanitizeNextPath } from "./redirect";

describe("sanitizeNextPath", () => {
  it("preserves local application routes", () => {
    expect(sanitizeNextPath("/groups/abc?invite=one")).toBe("/groups/abc?invite=one");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "groups"])(
    "rejects unsafe redirect target %s",
    (value) => {
      expect(sanitizeNextPath(value)).toBe("/groups");
    }
  );
});

describe("createAuthCallbackUrl", () => {
  it("encodes the intended route in the callback URL", () => {
    expect(createAuthCallbackUrl("https://friend.test", "/groups/one?invite=two")).toBe(
      "https://friend.test/auth/callback?next=%2Fgroups%2Fone%3Finvite%3Dtwo"
    );
  });
});
