import { describe, expect, it } from "vitest";

import { parseGroupInput } from "./input";

function groupForm(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("parseGroupInput", () => {
  it("normalizes a valid group", () => {
    expect(
      parseGroupInput(
        groupForm({ name: "  Sunday Crew  ", accentTheme: "emerald", creationPolicy: "members" })
      )
    ).toEqual({
      data: { name: "Sunday Crew", accentTheme: "emerald", creationPolicy: "members" }
    });
  });

  it("rejects an empty or oversized name", () => {
    expect(parseGroupInput(groupForm({ name: " ", accentTheme: "violet", creationPolicy: "members" }))).toEqual({
      error: "Group name must be between 1 and 80 characters."
    });
    expect(
      parseGroupInput(groupForm({ name: "x".repeat(81), accentTheme: "violet", creationPolicy: "members" }))
    ).toEqual({ error: "Group name must be between 1 and 80 characters." });
  });

  it("rejects unsupported authorization values", () => {
    expect(parseGroupInput(groupForm({ name: "Crew", accentTheme: "hidden", creationPolicy: "members" }))).toEqual({
      error: "Choose a valid group theme."
    });
    expect(parseGroupInput(groupForm({ name: "Crew", accentTheme: "sky", creationPolicy: "anyone" }))).toEqual({
      error: "Choose who can create markets."
    });
  });
});
