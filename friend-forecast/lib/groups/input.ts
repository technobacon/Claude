export const GROUP_THEMES = ["violet", "emerald", "coral", "sky"] as const;
export const GROUP_CREATION_POLICIES = ["owner", "moderators", "members"] as const;

export type GroupTheme = (typeof GROUP_THEMES)[number];
export type GroupCreationPolicy = (typeof GROUP_CREATION_POLICIES)[number];

export type GroupInput = {
  accentTheme: GroupTheme;
  creationPolicy: GroupCreationPolicy;
  name: string;
};

export type GroupInputResult =
  | { data: GroupInput; error?: never }
  | { data?: never; error: string };

export function parseGroupInput(formData: FormData): GroupInputResult {
  const name = String(formData.get("name") ?? "").trim();
  const accentTheme = String(formData.get("accentTheme") ?? "");
  const creationPolicy = String(formData.get("creationPolicy") ?? "");

  if (name.length < 1 || name.length > 80) {
    return { error: "Group name must be between 1 and 80 characters." };
  }

  if (!GROUP_THEMES.includes(accentTheme as GroupTheme)) {
    return { error: "Choose a valid group theme." };
  }

  if (!GROUP_CREATION_POLICIES.includes(creationPolicy as GroupCreationPolicy)) {
    return { error: "Choose who can create markets." };
  }

  return {
    data: {
      accentTheme: accentTheme as GroupTheme,
      creationPolicy: creationPolicy as GroupCreationPolicy,
      name
    }
  };
}
