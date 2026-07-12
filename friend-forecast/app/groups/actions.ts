"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { parseGroupInput } from "@/lib/groups/input";

export type CreateGroupState = {
  error: string;
};

export async function createGroupAction(
  _previousState: CreateGroupState,
  formData: FormData
): Promise<CreateGroupState> {
  const result = parseGroupInput(formData);

  if (!result.data) {
    return { error: result.error };
  }

  const { supabase } = await requireUser("/groups");
  const { data: groupId, error } = await supabase.rpc("create_group", {
    group_name: result.data.name,
    group_accent_theme: result.data.accentTheme,
    group_creation_policy: result.data.creationPolicy
  });

  if (error || typeof groupId !== "string") {
    return { error: "The group could not be created. Please try again." };
  }

  revalidatePath("/groups");
  redirect(`/groups/${groupId}`);
}
