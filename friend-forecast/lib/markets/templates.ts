import type { MarketOutcomeControl, MarketTemplateKey } from "@/lib/markets/input";

export type MarketTemplate = {
  cancelCondition: string;
  description: string;
  key: MarketTemplateKey;
  label: string;
  noCondition: string;
  outcomeControl: MarketOutcomeControl;
  question: string;
  resolutionSourceText: string;
  yesCondition: string;
};

export const MARKET_TEMPLATES: MarketTemplate[] = [
  {
    cancelCondition: "Cancel if the event or required evidence becomes unavailable.",
    description: "Start from a blank structured contract.",
    key: "custom",
    label: "Custom",
    noCondition: "NO if the defined result does not happen.",
    outcomeControl: "independent",
    question: "Will the defined result happen by the stated deadline?",
    resolutionSourceText: "Name the agreed source or observation method.",
    yesCondition: "YES if the defined result happens by the stated deadline."
  },
  {
    cancelCondition: "Cancel if the flight is cancelled before departure, the departure value is missing after 24 hours, or the source is unavailable with no accepted equivalent.",
    description: "Actual gate departure against an exact threshold.",
    key: "flight",
    label: "Flight",
    noCondition: "NO if the named source records actual gate departure after {time, date, and timezone}.",
    outcomeControl: "independent",
    question: "Will flight {number} record an actual gate-departure time no later than {time, date, and timezone}?",
    resolutionSourceText: "The named airline or airport flight-status record.",
    yesCondition: "YES if the named source records actual gate departure at or before {time, date, and timezone}."
  },
  {
    cancelCondition: "Cancel if the plan or destination materially changes, or the agreed arrival observation cannot be made.",
    description: "A person or group reaching a place by a time.",
    key: "arrival",
    label: "Arrival",
    noCondition: "NO if the agreed observation records arrival after {time, date, and timezone}.",
    outcomeControl: "participant_influenced",
    question: "Will {person or group} arrive at {place} by {time, date, and timezone}?",
    resolutionSourceText: "The named group observer, venue receipt, or agreed location record.",
    yesCondition: "YES if the agreed observation records arrival at or before {time, date, and timezone}."
  },
  {
    cancelCondition: "Cancel if the expense record is incomplete, the currency conversion is undefined, or the agreed spending scope materially changes.",
    description: "Shared spending against a defined limit.",
    key: "trip_budget",
    label: "Trip budget",
    noCondition: "NO if qualifying receipts total more than {amount and currency} for the stated period.",
    outcomeControl: "participant_influenced",
    question: "Will agreed shared trip spending stay at or below {amount and currency} from {start} through {end}?",
    resolutionSourceText: "The named shared expense tracker plus qualifying receipts.",
    yesCondition: "YES if qualifying receipts total at or below {amount and currency} for the stated period."
  },
  {
    cancelCondition: "Cancel if the event is cancelled or abandoned, or no official result is published within {window}.",
    description: "An official event result or statistic.",
    key: "sports",
    label: "Sports",
    noCondition: "NO if the official final result does not meet {defined outcome}.",
    outcomeControl: "independent",
    question: "Will {team or driver} achieve {defined outcome} in {event}?",
    resolutionSourceText: "The official league or event result page.",
    yesCondition: "YES if the official final result meets {defined outcome}."
  },
  {
    cancelCondition: "Cancel if the episode is pulled or rescheduled beyond {window}, or the outcome cannot be determined from the aired episode.",
    description: "A clearly observable event in an episode.",
    key: "tv_outcome",
    label: "TV outcome",
    noCondition: "NO if the identified episode completes without {defined event}.",
    outcomeControl: "independent",
    question: "Will {defined event} occur in {show, season, and episode}?",
    resolutionSourceText: "The named broadcast and identified episode.",
    yesCondition: "YES if the identified episode clearly shows or confirms {defined event}."
  },
  {
    cancelCondition: "Cancel if the challenge changes or is cancelled, or the required evidence becomes unavailable.",
    description: "A measurable goal completed by a friend or team.",
    key: "group_challenge",
    label: "Group challenge",
    noCondition: "NO if the deadline passes without qualifying evidence of {measurable objective}.",
    outcomeControl: "participant_influenced",
    question: "Will {participant or team} complete {measurable objective} by {deadline and timezone}?",
    resolutionSourceText: "The agreed group observation, photo, or named app log.",
    yesCondition: "YES if the agreed evidence confirms completion before {deadline and timezone}."
  }
];

export function marketTemplate(key: MarketTemplateKey) {
  return MARKET_TEMPLATES.find((template) => template.key === key) ?? MARKET_TEMPLATES[0];
}
