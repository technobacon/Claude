const REQUIRED_SERVER_ENV = ["SUPABASE_SERVICE_ROLE_KEY"] as const;
const REQUIRED_PUBLIC_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export function validateServerEnvironment(environment: Environment = process.env): void {
  const missing = [...REQUIRED_PUBLIC_ENV, ...REQUIRED_SERVER_ENV].filter((key) => !environment[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function getPublicEnvironment(environment: Environment = process.env) {
  return {
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  };
}
