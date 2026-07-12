export type InvitationInput = {
  expiresAt: string;
  maximumUses: number | null;
};

export type InvitationInputResult =
  | { data: InvitationInput; error?: never }
  | { data?: never; error: string };

export function parseInvitationInput(formData: FormData, now = new Date()): InvitationInputResult {
  const durationDays = Number(formData.get("durationDays"));
  const maximumUsesValue = String(formData.get("maximumUses") ?? "").trim();
  const maximumUses = maximumUsesValue ? Number(maximumUsesValue) : null;

  if (![1, 7, 30].includes(durationDays)) {
    return { error: "Choose a valid invitation duration." };
  }

  if (maximumUses !== null && (!Number.isInteger(maximumUses) || maximumUses < 1 || maximumUses > 100)) {
    return { error: "Maximum uses must be between 1 and 100." };
  }

  return {
    data: {
      expiresAt: new Date(now.getTime() + durationDays * 86_400_000).toISOString(),
      maximumUses
    }
  };
}
