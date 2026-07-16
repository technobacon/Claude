const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Human countdown for the trading deadline. The display is advisory —
 * the server clock decides whether a stake is accepted.
 */
export function formatTimeRemaining(msRemaining: number): string {
  if (!Number.isFinite(msRemaining)) {
    return "Deadline unavailable";
  }

  if (msRemaining <= 0) {
    return "Trading closed";
  }

  if (msRemaining >= DAY) {
    const days = Math.floor(msRemaining / DAY);
    const hours = Math.floor((msRemaining % DAY) / HOUR);
    return `Closes in ${days}d ${hours}h`;
  }

  if (msRemaining >= HOUR) {
    const hours = Math.floor(msRemaining / HOUR);
    const minutes = Math.floor((msRemaining % HOUR) / MINUTE);
    return `Closes in ${hours}h ${minutes}m`;
  }

  if (msRemaining >= MINUTE) {
    const minutes = Math.floor(msRemaining / MINUTE);
    const seconds = Math.floor((msRemaining % MINUTE) / SECOND);
    return `Closes in ${minutes}m ${seconds}s`;
  }

  return `Closes in ${Math.ceil(msRemaining / SECOND)}s`;
}

/** Tick often near the deadline, rarely far from it. */
export function countdownIntervalMs(msRemaining: number): number {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) {
    return HOUR;
  }
  if (msRemaining < HOUR) {
    return SECOND;
  }
  return MINUTE;
}
