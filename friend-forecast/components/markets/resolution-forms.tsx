"use client";

import { useActionState } from "react";

import {
  disputeResolutionAction,
  proposeResolutionAction,
  type ResolutionActionState
} from "@/app/groups/[groupId]/markets/[marketId]/actions";
import { OUTCOME_LABELS, RESOLUTION_OUTCOMES } from "@/lib/resolution/input";

type ResolutionFormProps = {
  groupId: string;
  marketId: string;
  requestId: string;
};

const initialActionState: ResolutionActionState = {
  attempt: 0,
  error: "",
  nextRequestId: null
};

export function ResolutionProposalForm({ groupId, marketId, requestId }: ResolutionFormProps) {
  const [state, formAction, isPending] = useActionState(
    proposeResolutionAction.bind(null, groupId, marketId),
    initialActionState
  );

  return (
    <form action={formAction} className="group-form" data-testid="proposal-form">
      <input type="hidden" name="requestId" value={state.nextRequestId ?? requestId} />
      <fieldset className="form-field" disabled={isPending}>
        <legend className="field-label">Proposed outcome</legend>
        {RESOLUTION_OUTCOMES.map((outcome, index) => (
          <label key={outcome} className="toggle-field">
            <input
              type="radio"
              name="outcome"
              value={outcome}
              defaultChecked={index === 0}
              data-testid={`outcome-${outcome}`}
            />
            <span>{OUTCOME_LABELS[outcome]}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-field">
        <label className="field-label" htmlFor="proposal-explanation">What happened, exactly?</label>
        <textarea
          id="proposal-explanation"
          name="explanation"
          rows={3}
          maxLength={2000}
          required
          minLength={3}
          disabled={isPending}
          placeholder="State the result the way the locked rules define it."
          data-testid="proposal-explanation"
        />
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor="proposal-evidence">Evidence link (optional)</label>
        <input
          id="proposal-evidence"
          name="evidenceUrl"
          type="url"
          inputMode="url"
          maxLength={2048}
          disabled={isPending}
          placeholder="https://…"
          data-testid="proposal-evidence"
        />
      </div>
      {state.error ? <p className="form-error" role="alert" data-testid="proposal-error">{state.error}</p> : null}
      <button className="primary-button" type="submit" disabled={isPending} data-testid="submit-proposal">
        {isPending ? "Submitting…" : "Propose this resolution"}
      </button>
      <p className="resolution-note">
        Proposals are permanent records. A challenge window opens before anything settles.
      </p>
    </form>
  );
}

export function ResolutionDisputeForm({ groupId, marketId, requestId }: ResolutionFormProps) {
  const [state, formAction, isPending] = useActionState(
    disputeResolutionAction.bind(null, groupId, marketId),
    initialActionState
  );

  return (
    <form action={formAction} className="group-form" data-testid="dispute-form">
      <input type="hidden" name="requestId" value={state.nextRequestId ?? requestId} />
      <div className="form-field">
        <label className="field-label" htmlFor="dispute-reason">Why is the proposal wrong?</label>
        <textarea
          id="dispute-reason"
          name="reason"
          rows={3}
          maxLength={2000}
          required
          minLength={3}
          disabled={isPending}
          placeholder="Point at the rule or evidence the proposal misses."
          data-testid="dispute-reason"
        />
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor="dispute-evidence">Evidence link (optional)</label>
        <input
          id="dispute-evidence"
          name="evidenceUrl"
          type="url"
          inputMode="url"
          maxLength={2048}
          disabled={isPending}
          placeholder="https://…"
          data-testid="dispute-evidence"
        />
      </div>
      {state.error ? <p className="form-error" role="alert" data-testid="dispute-error">{state.error}</p> : null}
      <button className="danger-button" type="submit" disabled={isPending} data-testid="submit-dispute">
        {isPending ? "Opening dispute…" : "Dispute this proposal"}
      </button>
      <p className="resolution-note">
        Your name stays on the dispute, and it moves the market into a hidden group vote. Each market gets one dispute.
      </p>
    </form>
  );
}
