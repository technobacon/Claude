import { describe, expect, it } from "vitest";

import { validateServerEnvironment } from "./env";

describe("validateServerEnvironment", () => {
  it("accepts a complete environment", () => {
    expect(() =>
      validateServerEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service"
      })
    ).not.toThrow();
  });

  it("reports every missing variable", () => {
    expect(() => validateServerEnvironment({})).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
    );
  });
});
