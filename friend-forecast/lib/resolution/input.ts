export const RESOLUTION_OUTCOMES = ["yes", "no", "cancel", "not_ready"] as const;

/**
 * Display copies of the PostgreSQL resolution windows
 * (resolution_challenge_window / resolution_creator_grace /
 * resolution_vote_window). The database remains authoritative.
 */
export const CHALLENGE_WINDOW_HOURS = 12;
export const CREATOR_GRACE_HOURS = 24;
export const VOTE_WINDOW_HOURS = 24;

export type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

export type ProposalInput = {
  evidenceUrl: string | null;
  explanation: string;
  outcome: ResolutionOutcome;
  requestId: string;
};

export type DisputeInput = {
  evidenceUrl: string | null;
  reason: string;
  requestId: string;
};

export type ResolutionInputResult<T> =
  | { data: T; error: "" }
  | { data: null; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OUTCOME_LABELS: Record<ResolutionOutcome, string> = {
  cancel: "CANCEL — refund every stake",
  no: "NO",
  not_ready: "NOT READY — the outcome is not decided yet",
  yes: "YES"
};

function trimmedField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseEvidenceUrl(value: string): { ok: boolean; url: string | null } {
  if (!value) {
    return { ok: true, url: null };
  }
  if (value.length > 2048 || value.includes("..")) {
    return { ok: false, url: null };
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, url: null };
    }
    return { ok: true, url: value };
  } catch {
    return { ok: false, url: null };
  }
}

export function isResolutionOutcome(value: string): value is ResolutionOutcome {
  return RESOLUTION_OUTCOMES.includes(value as ResolutionOutcome);
}

export function parseProposalInput(formData: FormData): ResolutionInputResult<ProposalInput> {
  const outcome = trimmedField(formData, "outcome");
  const explanation = trimmedField(formData, "explanation");
  const evidence = parseEvidenceUrl(trimmedField(formData, "evidenceUrl"));
  const requestId = trimmedField(formData, "requestId");

  if (!isResolutionOutcome(outcome)) {
    return { data: null, error: "Propose YES, NO, CANCEL, or NOT READY." };
  }
  if (explanation.length < 3 || explanation.length > 2000) {
    return { data: null, error: "Explain the outcome in 3 to 2000 characters." };
  }
  if (!evidence.ok) {
    return { data: null, error: "Evidence links must use HTTP or HTTPS." };
  }
  if (!UUID_PATTERN.test(requestId)) {
    return { data: null, error: "Refresh the market to start a valid proposal." };
  }

  return { data: { evidenceUrl: evidence.url, explanation, outcome, requestId }, error: "" };
}

export type VoteInput = {
  choice: ResolutionOutcome;
  requestId: string;
};

export function parseVoteInput(formData: FormData): ResolutionInputResult<VoteInput> {
  const choice = trimmedField(formData, "choice");
  const requestId = trimmedField(formData, "requestId");

  if (!isResolutionOutcome(choice)) {
    return { data: null, error: "Vote YES, NO, CANCEL, or NOT READY." };
  }
  if (!UUID_PATTERN.test(requestId)) {
    return { data: null, error: "Refresh the market to cast a valid vote." };
  }

  return { data: { choice, requestId }, error: "" };
}

export function parseDisputeInput(formData: FormData): ResolutionInputResult<DisputeInput> {
  const reason = trimmedField(formData, "reason");
  const evidence = parseEvidenceUrl(trimmedField(formData, "evidenceUrl"));
  const requestId = trimmedField(formData, "requestId");

  if (reason.length < 3 || reason.length > 2000) {
    return { data: null, error: "Explain the dispute in 3 to 2000 characters." };
  }
  if (!evidence.ok) {
    return { data: null, error: "Evidence links must use HTTP or HTTPS." };
  }
  if (!UUID_PATTERN.test(requestId)) {
    return { data: null, error: "Refresh the market to start a valid dispute." };
  }

  return { data: { evidenceUrl: evidence.url, reason, requestId }, error: "" };
}
