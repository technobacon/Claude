"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { parsePositionInput } from "@/lib/positions/input";

export type PositionActionState = {
  attempt: number;
  error: string;
  nextCommitRequestId: string | null;
};

const USER_FACING_ERROR_CODES = new Set(["22023", "55000", "42501"]);

function commitFailure(attempt: number, error: string): PositionActionState {
  return { attempt, error, nextCommitRequestId: randomUUID() };
}

function marketPaths(groupId: string, marketId: string): string[] {
  return [
    `/groups/${groupId}`,
    `/groups/${groupId}/wallet`,
    `/groups/${groupId}/markets/${marketId}`
  ];
}

export async function commitPositionAction(
  groupId: string,
  marketId: string,
  _previousState: PositionActionState,
  formData: FormData
): Promise<PositionActionState> {
  const attempt = _previousState.attempt + 1;
  const parsed = parsePositionInput(formData);
  if (!parsed.data) {
    return commitFailure(attempt, parsed.error);
  }

  const { supabase } = await requireUser(`/groups/${groupId}/markets/${marketId}`);
  const { error } = await supabase.rpc("commit_position", {
    commit_request_id: parsed.data.commitRequestId,
    stake_points: parsed.data.points,
    stake_side: parsed.data.side,
    target_market_id: marketId
  });

  if (error) {
    const message = USER_FACING_ERROR_CODES.has(error.code ?? "") && error.message
      ? error.message
      : "The points could not be committed. Refresh the market and try again.";
    return commitFailure(attempt, message);
  }

  for (const path of marketPaths(groupId, marketId)) {
    revalidatePath(path);
  }
  redirect(`/groups/${groupId}/markets/${marketId}?committed=${parsed.data.points}-${parsed.data.side}`);
}

export async function undoPositionAction(
  groupId: string,
  marketId: string,
  transactionId: string,
  undoRequestId: string,
  _formData: FormData
) {
  void _formData;
  const marketPath = `/groups/${groupId}/markets/${marketId}`;
  const { supabase } = await requireUser(marketPath);
  const { error } = await supabase.rpc("undo_position_commit", {
    target_transaction_id: transactionId,
    undo_request_id: undoRequestId
  });

  for (const path of marketPaths(groupId, marketId)) {
    revalidatePath(path);
  }
  redirect(`${marketPath}?undo=${error ? "unavailable" : "done"}`);
}
