import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketWizard } from "@/components/markets/market-wizard";
import { requireUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

type NewMarketPageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function NewMarketPage({ params }: NewMarketPageProps) {
  const { groupId } = await params;
  const { supabase } = await requireUser(`/groups/${groupId}/markets/new`);
  const now = new Date().toISOString();
  const [
    { data: group, error: groupError },
    { data: canCreate, error: permissionError },
    { data: activeSeason, error: seasonError }
  ] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme, creation_policy").eq("id", groupId).maybeSingle(),
    supabase.rpc("can_create_market", { target_group_id: groupId }),
    supabase
      .from("seasons")
      .select("id, ends_at")
      .eq("group_id", groupId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .maybeSingle()
  ]);

  if (groupError || permissionError || seasonError) {
    throw new Error("The group could not be loaded.");
  }
  if (!group) {
    notFound();
  }

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>{group.name}</span>
        </Link>
      </header>
      <section className="group-hero market-create-hero">
        <span className="eyebrow">Structured market · private group</span>
        <h1>Make the question settleable.</h1>
        <p>Four short steps turn a group-chat prediction into clear YES, NO, and refund rules.</p>
      </section>
      {canCreate && activeSeason ? (
        <MarketWizard
          groupId={groupId}
          requestIds={{ creation: randomUUID(), mutation: randomUUID(), publish: randomUUID() }}
          seasonEndsAt={activeSeason.ends_at}
        />
      ) : (
        <section className="dashboard-card permission-card">
          <span className="card-kicker">{canCreate ? "Season unavailable" : "Creation policy"}</span>
          <h2>{canCreate ? "This group has no active market season." : "You cannot create markets in this group."}</h2>
          <p>
            {canCreate
              ? "An owner must start an active season before the group can publish a forecast."
              : <>The current policy is <strong>{group.creation_policy}</strong>. Ask an owner or moderator to create this forecast.</>}
          </p>
          <Link className="text-link" href={`/groups/${groupId}`}>Return to group</Link>
        </section>
      )}
    </main>
  );
}
