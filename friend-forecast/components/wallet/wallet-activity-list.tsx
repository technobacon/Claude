import { formatPoints, walletEntryLabel } from "@/lib/wallet/ledger";
import type { WalletActivity } from "@/lib/wallet/read-model";

const activityDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC"
});

export function WalletActivityList({ activity }: { activity: WalletActivity[] }) {
  if (!activity.length) {
    return <p>No wallet activity yet.</p>;
  }

  return (
    <ul className="wallet-activity-list">
      {activity.map((entry) => (
        <li key={entry.id}>
          <span>
            <strong>{walletEntryLabel(entry.type)}</strong>
            <small>{activityDate.format(new Date(entry.createdAt))}</small>
          </span>
          <strong className={entry.amount > 0 ? "amount-positive" : "amount-negative"}>
            {formatPoints(entry.amount, true)}
          </strong>
        </li>
      ))}
    </ul>
  );
}
