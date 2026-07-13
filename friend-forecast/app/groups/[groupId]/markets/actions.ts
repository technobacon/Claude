"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { isRequestId, parseMarketInput, type MarketInput } from "@/lib/markets/input";

export type MarketActionState = {
  attempt: number;
  error: string;
  nextMutationRequestId: string | null;
  nextPublishRequestId: string | null;
  revision: number | null;
  step: 1 | 2 | 3 | 4;
};

function rpcContract(input: MarketInput) {
  return {
    market_cancel_condition: input.cancelCondition,
    market_creator_can_participate: input.creatorCanParticipate,
    market_no_condition: input.noCondition,
    market_outcome_control: input.outcomeControl,
    market_question: input.question,
    market_resolution_eligible_at: input.resolutionEligibleAt,
    market_resolution_mode: input.resolutionMode,
    market_resolution_source_text: input.resolutionSourceText,
    market_resolution_source_url: input.resolutionSourceUrl,
    market_template_key: input.templateKey,
    market_timezone: input.timezone,
    market_trading_closes_at: input.tradingClosesAt,
    market_yes_condition: input.yesCondition
  };
}

function actionFailure(
  attempt: number,
  error: string,
  step: 1 | 2 | 3 | 4,
  revision: number | null = null,
  rotateMutationRequests = false
): MarketActionState {
  return {
    attempt,
    error,
    nextMutationRequestId: rotateMutationRequests ? randomUUID() : null,
    nextPublishRequestId: rotateMutationRequests ? randomUUID() : null,
    revision,
    step
  };
}

export async function createMarketAction(
  groupId: string,
  _previousState: MarketActionState,
  formData: FormData
): Promise<MarketActionState> {
  const attempt = _previousState.attempt + 1;
  const parsed = parseMarketInput(formData);
  if (!parsed.data) {
    return actionFailure(attempt, parsed.error, parsed.step);
  }

  const creationRequestId = formData.get("creationRequestId");
  if (typeof creationRequestId !== "string" || !isRequestId(creationRequestId)) {
    return actionFailure(attempt, "Refresh the form to start a valid creation request.", 4);
  }

  const { supabase } = await requireUser(`/groups/${groupId}/markets/new`);
  const { data: marketId, error } = await supabase.rpc("create_market", {
    ...rpcContract(parsed.data),
    market_creation_request_id: creationRequestId,
    market_publish: parsed.data.intent === "publish",
    target_group_id: groupId
  });

  if (error || typeof marketId !== "string") {
    return actionFailure(attempt, "The market could not be created. Check the group policy, season, and deadline, then try again.", 4);
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/markets/${marketId}`);
  redirect(`/groups/${groupId}/markets/${marketId}?created=${parsed.data.intent}`);
}

export async function updateMarketAction(
  groupId: string,
  marketId: string,
  _previousState: MarketActionState,
  formData: FormData
): Promise<MarketActionState> {
  const attempt = _previousState.attempt + 1;
  const parsed = parseMarketInput(formData);
  const expectedRevision = Number(formData.get("expectedRuleRevision"));
  const mutationRequestId = formData.get("mutationRequestId");
  const publishRequestId = formData.get("publishRequestId");

  if (!parsed.data) {
    return actionFailure(attempt, parsed.error, parsed.step, Number.isInteger(expectedRevision) ? expectedRevision : null, true);
  }

  if (
    !Number.isInteger(expectedRevision)
    || expectedRevision < 1
    || typeof mutationRequestId !== "string"
    || !isRequestId(mutationRequestId)
    || typeof publishRequestId !== "string"
    || !isRequestId(publishRequestId)
  ) {
    return actionFailure(attempt, "Refresh the draft before saving it.", 4, null, true);
  }

  const { supabase } = await requireUser(`/groups/${groupId}/markets/${marketId}/edit`);
  const { data: savedRevisionValue, error: saveError } = await supabase.rpc("save_market_draft", {
    ...rpcContract(parsed.data),
    expected_rule_revision: expectedRevision,
    mutation_request_id: mutationRequestId,
    target_market_id: marketId
  });
  const savedRevision = Number(savedRevisionValue);

  if (saveError || !Number.isInteger(savedRevision) || savedRevision < 1) {
    return actionFailure(attempt, "The draft could not be saved. It may have changed or received its first stake; retry once, then reload if the error continues.", 4);
  }

  if (parsed.data.intent === "publish") {
    const { error: publishError } = await supabase.rpc("publish_market", {
      expected_rule_revision: savedRevision,
      mutation_request_id: publishRequestId,
      target_market_id: marketId
    });

    if (publishError) {
      revalidatePath(`/groups/${groupId}/markets/${marketId}`);
      return actionFailure(attempt, "Your changes were saved as a draft, but the market could not be published. Review the deadline and try again.", 4, savedRevision, true);
    }
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/markets/${marketId}`);
  redirect(`/groups/${groupId}/markets/${marketId}?updated=${parsed.data.intent}`);
}

export async function publishMarketAction(
  groupId: string,
  marketId: string,
  expectedRevision: number,
  requestId: string,
  _formData: FormData
) {
  void _formData;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || !isRequestId(requestId)) {
    redirect(`/groups/${groupId}/markets/${marketId}?publish=unavailable`);
  }

  const { supabase } = await requireUser(`/groups/${groupId}/markets/${marketId}`);
  const { error } = await supabase.rpc("publish_market", {
    expected_rule_revision: expectedRevision,
    mutation_request_id: requestId,
    target_market_id: marketId
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/markets/${marketId}`);
  redirect(`/groups/${groupId}/markets/${marketId}?publish=${error ? "unavailable" : "published"}`);
}
