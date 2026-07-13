export const WALLET_LEDGER_TYPES = [
  "opening_grant",
  "weekly_grant",
  "position_debit",
  "position_reversal",
  "settlement_credit",
  "refund_credit",
  "admin_adjustment"
] as const;

export type WalletLedgerType = (typeof WALLET_LEDGER_TYPES)[number];

export type WalletLedgerEntry = {
  amount: number;
  idempotencyKey: string;
  type: WalletLedgerType;
};

const ENTRY_LABELS: Record<WalletLedgerType, string> = {
  opening_grant: "Opening grant",
  weekly_grant: "Weekly grant",
  position_debit: "Position committed",
  position_reversal: "Position restored",
  settlement_credit: "Market payout",
  refund_credit: "Market refund",
  admin_adjustment: "Adjustment"
};

const POSITIVE_TYPES = new Set<WalletLedgerType>([
  "opening_grant",
  "weekly_grant",
  "position_reversal",
  "settlement_credit",
  "refund_credit"
]);

export function isWalletLedgerType(value: string): value is WalletLedgerType {
  return WALLET_LEDGER_TYPES.includes(value as WalletLedgerType);
}

export function walletEntryLabel(type: WalletLedgerType): string {
  return ENTRY_LABELS[type];
}

export function coerceLedgerInteger(value: string | number): number {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(numberValue)) {
    throw new Error("Ledger values must be safe integers.");
  }

  return numberValue;
}

export function formatPoints(value: number, showSign = false): string {
  const normalized = coerceLedgerInteger(value);
  const formatted = new Intl.NumberFormat("en-US").format(Math.abs(normalized));

  if (!showSign || normalized === 0) {
    return `${normalized < 0 ? "−" : ""}${formatted}`;
  }

  return `${normalized > 0 ? "+" : "−"}${formatted}`;
}

export function summarizeLedger(entries: WalletLedgerEntry[]) {
  const seenKeys = new Set<string>();
  let credits = 0;
  let debits = 0;
  let isReconciled = true;

  for (const entry of entries) {
    const amount = coerceLedgerInteger(entry.amount);
    const key = entry.idempotencyKey.trim();
    const hasValidSign = entry.type === "admin_adjustment"
      ? amount !== 0
      : POSITIVE_TYPES.has(entry.type)
        ? amount > 0
        : amount < 0;

    if (!key || seenKeys.has(key) || !hasValidSign) {
      isReconciled = false;
    }

    seenKeys.add(key);

    if (amount > 0) {
      credits += amount;
    } else {
      debits += Math.abs(amount);
    }

    if (!Number.isSafeInteger(credits) || !Number.isSafeInteger(debits)) {
      throw new Error("Ledger total exceeds the safe integer range.");
    }
  }

  return {
    activityCount: entries.length,
    balance: credits - debits,
    credits,
    debits,
    isReconciled
  };
}
