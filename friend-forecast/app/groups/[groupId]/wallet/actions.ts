"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

export async function applyWeeklyGrantsAction(groupId: string, _formData: FormData) {
  void _formData;
  const walletPath = `/groups/${groupId}/wallet`;
  const { supabase } = await requireUser(walletPath);
  const { data, error } = await supabase.rpc("apply_current_weekly_grants", {
    target_group_id: groupId
  });

  if (error) {
    redirect(`${walletPath}?grant=unavailable`);
  }

  const result = ((data as Array<{ wallets_processed: number }> | null) ?? [])[0];
  revalidatePath(walletPath);
  revalidatePath(`/groups/${groupId}`);
  redirect(`${walletPath}?grant=${result?.wallets_processed ? "applied" : "current"}`);
}
