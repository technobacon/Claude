export const MARKET_TEMPLATE_KEYS = [
  "custom",
  "flight",
  "arrival",
  "trip_budget",
  "sports",
  "tv_outcome",
  "group_challenge"
] as const;

export type MarketTemplateKey = (typeof MARKET_TEMPLATE_KEYS)[number];
export type MarketOutcomeControl = "independent" | "creator_influenced" | "participant_influenced";
export type MarketResolutionMode = "creator_final" | "disputable";
export type MarketIntent = "draft" | "publish";

export type MarketInput = {
  cancelCondition: string;
  creatorCanParticipate: boolean;
  intent: MarketIntent;
  noCondition: string;
  outcomeControl: MarketOutcomeControl;
  question: string;
  resolutionEligibleAt: string;
  resolutionEligibleLocal: string;
  resolutionMode: MarketResolutionMode;
  resolutionSourceText: string;
  resolutionSourceUrl: string | null;
  templateKey: MarketTemplateKey;
  timezone: string;
  tradingClosesAt: string;
  tradingClosesLocal: string;
  yesCondition: string;
};

export type MarketInputResult =
  | { data: MarketInput; error: ""; step: 4 }
  | { data: null; error: string; step: 1 | 2 | 3 | 4 };

export type MarketWarning = {
  code: "creator_control" | "generic_source" | "measurement" | "participant_control" | "placeholder" | "vague_wording";
  message: string;
  title: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function enumValue<const T extends readonly string[]>(value: string, choices: T): T[number] | null {
  return choices.includes(value as T[number]) ? (value as T[number]) : null;
}

function normalizedRule(value: string) {
  return value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

export function isRequestId(value: string) {
  return UUID_PATTERN.test(value);
}

export function isIanaTimezone(value: string) {
  if (!value || value.length > 100) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && Boolean(url.hostname)
      && !url.hostname.startsWith(".")
      && !url.hostname.endsWith(".")
      && !url.hostname.includes("..")
      && !/\s/.test(value);
  } catch {
    return false;
  }
}

export function hasUnresolvedMarketTokens(values: {
  cancelCondition: string;
  noCondition: string;
  question: string;
  resolutionSourceText: string;
  yesCondition: string;
}) {
  const text = `${values.question} ${values.yesCondition} ${values.noCondition} ${values.cancelCondition} ${values.resolutionSourceText}`;
  return /\{[^}]+\}|\[[^\]]+\]|the defined result|the stated deadline|name the agreed source/i.test(text);
}

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

function localDateParts(value: string): DateParts | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = {
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    month: Number(monthText),
    year: Number(yearText)
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));

  return check.getUTCFullYear() === parts.year
    && check.getUTCMonth() === parts.month - 1
    && check.getUTCDate() === parts.day
    && check.getUTCHours() === parts.hour
    && check.getUTCMinutes() === parts.minute
    ? parts
    : null;
}

function zonedParts(instant: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric"
  });
  const entries = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    day: entries.day,
    hour: entries.hour,
    minute: entries.minute,
    month: entries.month,
    year: entries.year
  };
}

function partsMatch(left: DateParts, right: DateParts) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function zoneOffsetAt(timestamp: number, timezone: string) {
  const instant = new Date(timestamp);
  const parts = zonedParts(instant, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - timestamp;
}

export function zonedLocalToIso(value: string, timezone: string) {
  const desired = localDateParts(value);
  if (!desired || !isIanaTimezone(timezone)) {
    return null;
  }

  const wallClockAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  const possibleOffsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    possibleOffsets.add(zoneOffsetAt(wallClockAsUtc + hours * 3_600_000, timezone));
  }
  const matches = [...possibleOffsets]
    .map((offset) => wallClockAsUtc - offset)
    .sort((left, right) => left - right)
    .filter((candidate) => partsMatch(zonedParts(new Date(candidate), timezone), desired));

  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}

export function isoToZonedLocal(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || !isIanaTimezone(timezone)) {
    return "";
  }

  const parts = zonedParts(date, timezone);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseMarketInput(formData: FormData, now = new Date()): MarketInputResult {
  const question = stringValue(formData, "question");
  const templateKey = enumValue(stringValue(formData, "templateKey"), MARKET_TEMPLATE_KEYS);

  if (!templateKey) {
    return { data: null, error: "Choose a supported starting template.", step: 1 };
  }

  if (question.length < 8 || question.length > 240) {
    return { data: null, error: "Write a binary question between 8 and 240 characters.", step: 1 };
  }

  const yesCondition = stringValue(formData, "yesCondition");
  const noCondition = stringValue(formData, "noCondition");
  const cancelCondition = stringValue(formData, "cancelCondition");
  const resolutionSourceText = stringValue(formData, "resolutionSourceText");
  const resolutionSourceUrlText = stringValue(formData, "resolutionSourceUrl");

  if ([yesCondition, noCondition, cancelCondition].some((rule) => rule.length < 3 || rule.length > 1000)) {
    return { data: null, error: "YES, NO, and cancellation rules must each be between 3 and 1,000 characters.", step: 2 };
  }

  const normalizedRules = [yesCondition, noCondition, cancelCondition].map(normalizedRule);
  if (new Set(normalizedRules).size !== normalizedRules.length) {
    return { data: null, error: "YES, NO, and cancellation rules must describe different outcomes.", step: 2 };
  }

  if (resolutionSourceText.length < 3 || resolutionSourceText.length > 500) {
    return { data: null, error: "Name the evidence or observation method in 3 to 500 characters.", step: 2 };
  }

  if (resolutionSourceUrlText && (resolutionSourceUrlText.length > 2048 || !isHttpUrl(resolutionSourceUrlText))) {
    return { data: null, error: "The optional source link must be a valid HTTP or HTTPS URL.", step: 2 };
  }

  const timezone = stringValue(formData, "timezone");
  const tradingClosesLocal = stringValue(formData, "tradingClosesLocal");
  const resolutionEligibleLocal = stringValue(formData, "resolutionEligibleLocal");
  const tradingClosesAt = zonedLocalToIso(tradingClosesLocal, timezone);
  const resolutionEligibleAt = zonedLocalToIso(resolutionEligibleLocal, timezone);

  if (!isIanaTimezone(timezone)) {
    return { data: null, error: "Enter a valid IANA timezone, such as Europe/Budapest.", step: 3 };
  }

  if (!tradingClosesAt || !resolutionEligibleAt) {
    return { data: null, error: "Enter valid local dates and times for this timezone.", step: 3 };
  }

  if (new Date(tradingClosesAt).valueOf() <= now.valueOf()) {
    return { data: null, error: "Trading must close in the future.", step: 3 };
  }

  if (new Date(resolutionEligibleAt).valueOf() < new Date(tradingClosesAt).valueOf()) {
    return { data: null, error: "Earliest resolution cannot be before trading closes.", step: 3 };
  }

  const resolutionMode = enumValue(stringValue(formData, "resolutionMode"), ["creator_final", "disputable"] as const);
  const outcomeControl = enumValue(
    stringValue(formData, "outcomeControl"),
    ["independent", "creator_influenced", "participant_influenced"] as const
  );
  const creatorCanParticipate = stringValue(formData, "creatorCanParticipate") === "true";
  const intent = enumValue(stringValue(formData, "intent"), ["draft", "publish"] as const);

  if (!resolutionMode || !outcomeControl || !intent) {
    return { data: null, error: "Choose valid participation, dispute, and publishing settings.", step: 4 };
  }

  if (intent === "publish" && hasUnresolvedMarketTokens({
    cancelCondition,
    noCondition,
    question,
    resolutionSourceText,
    yesCondition
  })) {
    return { data: null, error: "Replace every template placeholder before publishing.", step: 4 };
  }

  if (outcomeControl !== "independent" && resolutionMode !== "disputable") {
    return { data: null, error: "A creator- or participant-influenced result must allow a group dispute.", step: 4 };
  }

  if (
    resolutionMode === "creator_final"
    && (creatorCanParticipate || outcomeControl !== "independent" || !resolutionSourceUrlText)
  ) {
    return {
      data: null,
      error: "Creator-final settlement requires an independent result, no creator stake, and an objective source link.",
      step: 4
    };
  }

  return {
    data: {
      cancelCondition,
      creatorCanParticipate,
      intent,
      noCondition,
      outcomeControl,
      question,
      resolutionEligibleAt,
      resolutionEligibleLocal,
      resolutionMode,
      resolutionSourceText,
      resolutionSourceUrl: resolutionSourceUrlText || null,
      templateKey,
      timezone,
      tradingClosesAt,
      tradingClosesLocal,
      yesCondition
    },
    error: "",
    step: 4
  };
}

export function getMarketWarnings(input: Pick<
  MarketInput,
  | "cancelCondition"
  | "creatorCanParticipate"
  | "noCondition"
  | "outcomeControl"
  | "question"
  | "resolutionSourceText"
  | "yesCondition"
>) {
  const warnings: MarketWarning[] = [];
  const contractText = `${input.question} ${input.yesCondition} ${input.noCondition} ${input.cancelCondition} ${input.resolutionSourceText}`;

  if (/\b(soon|late|on time|this weekend|before long|around)\b/i.test(contractText)) {
    warnings.push({
      code: "vague_wording",
      message: "Replace relative timing with an exact date, time, threshold, and observation.",
      title: "Vague timing detected"
    });
  }

  if (hasUnresolvedMarketTokens(input)) {
    warnings.push({
      code: "placeholder",
      message: "Replace every bracketed template placeholder with the real person, event, value, or deadline.",
      title: "Template details remain"
    });
  }

  if (
    /\b(arrive|leave|finish|attend|budget|ready|successful|complete)\b/i.test(input.question)
    && !/(\d|before|after|at or before|at or after|official|receipt|record|log)/i.test(contractText)
  ) {
    warnings.push({
      code: "measurement",
      message: "Name the threshold and the exact observation that proves the result.",
      title: "Measurement may be unclear"
    });
  }

  if (/^(online|the app|we('ll| will) know|the internet|group chat)$/i.test(input.resolutionSourceText)) {
    warnings.push({
      code: "generic_source",
      message: "Name the specific site, record, observer, receipt, broadcast, or app field the group will use.",
      title: "Source is too generic"
    });
  }

  if (input.outcomeControl === "participant_influenced") {
    warnings.push({
      code: "participant_control",
      message: "Participants can affect this result, so group disputes remain enabled and the control is shown prominently.",
      title: "Participant-controlled outcome"
    });
  }

  if (
    input.outcomeControl === "creator_influenced"
    || (input.creatorCanParticipate && input.outcomeControl !== "independent")
    || /\b(i|we|creator)\b.{0,40}\b(attend|arrive|leave|finish|complete|choose|decide|cancel|show up)\b/i.test(contractText)
  ) {
    warnings.push({
      code: "creator_control",
      message: "The creator may influence or stake on this result. Keep settlement disputable and consider disabling creator participation.",
      title: "Creator conflict to review"
    });
  }

  return warnings;
}
