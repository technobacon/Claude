const DEFAULT_AUTH_DESTINATION = "/groups";

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AUTH_DESTINATION;
  }

  return value;
}

export function createAuthCallbackUrl(origin: string, nextPath: string): string {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", sanitizeNextPath(nextPath));
  return callbackUrl.toString();
}
