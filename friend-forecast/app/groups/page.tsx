import Link from "next/link";
import { ProfileForm } from "@/components/auth/profile-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { requireUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

type GroupRow = {
  accent_theme: string;
  created_at: string;
  id: string;
  name: string;
};

type MembershipRow = {
  group_id: string;
  role: "owner" | "moderator" | "member";
};

export default async function GroupsPage() {
  const { supabase, userId } = await requireUser("/groups");
  const [{ data: profile }, { data: groupData }, { data: membershipData }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("groups").select("id, name, accent_theme, created_at").order("created_at", { ascending: false }),
    supabase.from("group_memberships").select("group_id, role").eq("user_id", userId).eq("status", "active")
  ]);

  const displayName = profile?.display_name ?? "New forecaster";
  const groups = (groupData ?? []) as GroupRow[];
  const memberships = (membershipData ?? []) as MembershipRow[];
  const roleByGroup = new Map(memberships.map((membership) => [membership.group_id, membership.role]));

  return (
    <main className="page-shell dashboard-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>Friend Forecast</span>
        </Link>
        <SignOutButton />
      </header>
      <section className="dashboard-hero">
        <span className="eyebrow">Your private league</span>
        <h1>Welcome, {displayName}.</h1>
        <p>Create a private space for the friends who will make, fund, and settle forecasts together.</p>
      </section>
      <div className="dashboard-grid">
        <section className="dashboard-card" aria-labelledby="groups-heading">
          <span className="card-kicker">Groups</span>
          <h2 id="groups-heading">{groups.length ? "Your groups" : "No groups yet"}</h2>
          {groups.length ? (
            <ul className="group-list">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link href={`/groups/${group.id}`}>
                    <span className={`group-swatch theme-${group.accent_theme}`} aria-hidden="true" />
                    <span>
                      <strong>{group.name}</strong>
                      <small>{roleByGroup.get(group.id) ?? "member"}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>Create the first private group and invite your friends next.</p>}
        </section>
        <section className="dashboard-card" aria-labelledby="create-group-heading">
          <span className="card-kicker">New league</span>
          <h2 id="create-group-heading">Create a group</h2>
          <p>The creator becomes owner and receives the first season’s 1,000-point opening grant.</p>
          <CreateGroupForm />
        </section>
        <section className="dashboard-card" aria-labelledby="profile-heading">
          <span className="card-kicker">Account</span>
          <h2 id="profile-heading">Your profile</h2>
          <p>This is the name friends will see beside your forecasts.</p>
          <ProfileForm initialDisplayName={displayName} userId={userId} />
        </section>
      </div>
    </main>
  );
}
