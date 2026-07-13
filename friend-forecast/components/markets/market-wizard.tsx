"use client";

import { useActionState, useEffect, useState } from "react";

import {
  createMarketAction,
  updateMarketAction,
  type MarketActionState
} from "@/app/groups/[groupId]/markets/actions";
import { MarketRulesPreview } from "@/components/markets/market-rules-preview";
import {
  getMarketWarnings,
  isoToZonedLocal,
  isHttpUrl,
  zonedLocalToIso,
  type MarketOutcomeControl,
  type MarketResolutionMode,
  type MarketTemplateKey
} from "@/lib/markets/input";
import { MARKET_TEMPLATES } from "@/lib/markets/templates";

export type MarketWizardValues = {
  cancelCondition: string;
  creatorCanParticipate: boolean;
  noCondition: string;
  outcomeControl: MarketOutcomeControl;
  question: string;
  resolutionEligibleLocal: string;
  resolutionMode: MarketResolutionMode;
  resolutionSourceText: string;
  resolutionSourceUrl: string;
  templateKey: MarketTemplateKey;
  timezone: string;
  tradingClosesLocal: string;
  yesCondition: string;
};

type MarketWizardProps = {
  groupId: string;
  initialValues?: MarketWizardValues;
  marketId?: string;
  requestIds: {
    creation: string;
    mutation: string;
    publish: string;
  };
  revision?: number;
  seasonEndsAt?: string;
};

const blankValues: MarketWizardValues = {
  cancelCondition: "",
  creatorCanParticipate: true,
  noCondition: "",
  outcomeControl: "independent",
  question: "",
  resolutionEligibleLocal: "",
  resolutionMode: "disputable",
  resolutionSourceText: "",
  resolutionSourceUrl: "",
  templateKey: "custom",
  timezone: "UTC",
  tradingClosesLocal: "",
  yesCondition: ""
};

const stepNames = ["Ask", "Define", "Time", "Review"];
const timezoneSuggestions = [
  "UTC",
  "Europe/Budapest",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney"
];

function nextRequestId() {
  return globalThis.crypto.randomUUID();
}

export function MarketWizard({
  groupId,
  initialValues,
  marketId,
  requestIds,
  revision = 1,
  seasonEndsAt
}: MarketWizardProps) {
  const [values, setValues] = useState<MarketWizardValues>(initialValues ?? blankValues);
  const [step, setStep] = useState(1);
  const [highestStep, setHighestStep] = useState(1);
  const [stepError, setStepError] = useState("");
  const [dismissedAttempt, setDismissedAttempt] = useState(0);
  const [creationRequestId] = useState(requestIds.creation);
  const [mutationRequestId, setMutationRequestId] = useState(requestIds.mutation);
  const [publishRequestId, setPublishRequestId] = useState(requestIds.publish);
  const boundAction = marketId
    ? updateMarketAction.bind(null, groupId, marketId)
    : createMarketAction.bind(null, groupId);
  const initialActionState: MarketActionState = {
    attempt: 0,
    error: "",
    nextMutationRequestId: null,
    nextPublishRequestId: null,
    revision: marketId ? revision : null,
    step: 4
  };
  const [state, formAction, isPending] = useActionState(boundAction, initialActionState);
  const expectedRevision = state.revision ?? revision;
  const serverErrorVisible = Boolean(state.error) && state.attempt > dismissedAttempt;
  const activeStep = serverErrorVisible ? state.step : step;
  const effectiveMutationRequestId = serverErrorVisible && state.nextMutationRequestId
    ? state.nextMutationRequestId
    : mutationRequestId;
  const effectivePublishRequestId = serverErrorVisible && state.nextPublishRequestId
    ? state.nextPublishRequestId
    : publishRequestId;

  useEffect(() => {
    document.getElementById(`wizard-step-${activeStep}-heading`)?.focus();
  }, [activeStep]);

  function rotateMutationRequests() {
    if (marketId) {
      setMutationRequestId(nextRequestId());
      setPublishRequestId(nextRequestId());
    }
  }

  function dismissServerError(payloadChanged: boolean) {
    if (serverErrorVisible) {
      setStep(state.step);
      setDismissedAttempt(state.attempt);
      if (marketId) {
        if (payloadChanged) {
          rotateMutationRequests();
        } else {
          if (state.nextMutationRequestId) setMutationRequestId(state.nextMutationRequestId);
          if (state.nextPublishRequestId) setPublishRequestId(state.nextPublishRequestId);
        }
      }
    }
  }

  function change(patch: Partial<MarketWizardValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setStepError("");
    dismissServerError(true);
    if (!serverErrorVisible) rotateMutationRequests();
  }

  function navigateToStep(targetStep: number) {
    setStepError("");
    dismissServerError(false);
    setStep(targetStep);
  }

  function applyTemplate(key: MarketTemplateKey) {
    const template = MARKET_TEMPLATES.find((candidate) => candidate.key === key);
    if (!template) return;

    change({
      cancelCondition: template.cancelCondition,
      creatorCanParticipate: key !== "group_challenge",
      noCondition: template.noCondition,
      outcomeControl: template.outcomeControl,
      question: template.question,
      resolutionMode: "disputable",
      resolutionSourceText: template.resolutionSourceText,
      resolutionSourceUrl: "",
      templateKey: template.key,
      yesCondition: template.yesCondition
    });
  }

  function validateCurrentStep() {
    if (activeStep === 1 && (values.question.trim().length < 8 || values.question.trim().length > 240)) {
      return "Write a binary question between 8 and 240 characters.";
    }
    if (
      activeStep === 2
      && (
        [values.yesCondition, values.noCondition, values.cancelCondition].some((rule) => rule.trim().length < 3)
        || values.resolutionSourceText.trim().length < 3
      )
    ) {
      return "Define YES, NO, cancellation, and the evidence source before continuing.";
    }
    if (activeStep === 2 && values.resolutionSourceUrl && !isHttpUrl(values.resolutionSourceUrl)) {
      return "The optional source link must be a valid HTTP or HTTPS URL.";
    }
    if (activeStep === 3) {
      const closesAt = zonedLocalToIso(values.tradingClosesLocal, values.timezone);
      const resolvesAt = zonedLocalToIso(values.resolutionEligibleLocal, values.timezone);
      if (!closesAt || !resolvesAt) {
        return "Enter unambiguous dates and times in a valid IANA timezone.";
      }
      if (new Date(closesAt).valueOf() <= Date.now()) {
        return "Trading must close in the future.";
      }
      if (new Date(resolvesAt).valueOf() < new Date(closesAt).valueOf()) {
        return "Earliest resolution cannot be before trading closes.";
      }
      if (seasonEndsAt && new Date(closesAt).valueOf() > new Date(seasonEndsAt).valueOf()) {
        return "Trading must close before the active season ends.";
      }
    }
    return "";
  }

  function advance() {
    const error = validateCurrentStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError("");
    const nextStep = Math.min(4, activeStep + 1);
    setStep(nextStep);
    setHighestStep((current) => Math.max(current, nextStep));
  }

  const tradingClosesAt = zonedLocalToIso(values.tradingClosesLocal, values.timezone) ?? "";
  const resolutionEligibleAt = zonedLocalToIso(values.resolutionEligibleLocal, values.timezone) ?? "";
  const seasonEndLocal = seasonEndsAt ? isoToZonedLocal(seasonEndsAt, values.timezone) : "";
  const warnings = getMarketWarnings(values);

  return (
    <form action={formAction} className="market-wizard" noValidate>
      <input name="creationRequestId" type="hidden" value={creationRequestId} />
      <input name="expectedRuleRevision" type="hidden" value={expectedRevision} />
      <input name="mutationRequestId" type="hidden" value={effectiveMutationRequestId} />
      <input name="publishRequestId" type="hidden" value={effectivePublishRequestId} />
      <input name="templateKey" type="hidden" value={values.templateKey} />
      <input name="creatorCanParticipate" type="hidden" value={String(values.creatorCanParticipate)} />

      <ol className="wizard-progress" aria-label="Market creation progress">
        {stepNames.map((name, index) => (
          <li className={activeStep === index + 1 ? "active" : activeStep > index + 1 ? "complete" : ""} key={name}>
            <button
              aria-current={activeStep === index + 1 ? "step" : undefined}
              disabled={index + 1 > highestStep}
              onClick={() => navigateToStep(index + 1)}
              type="button"
            >
              <span>{index + 1}</span>{name}
            </button>
          </li>
        ))}
      </ol>

      {serverErrorVisible ? <p className="form-error wizard-error" role="alert">{state.error}</p> : null}
      {stepError ? <p className="form-error wizard-error" role="alert">{stepError}</p> : null}

      <section className="wizard-step" hidden={activeStep !== 1} aria-labelledby="wizard-step-1-heading">
        <span className="card-kicker">Step 1 · Ask</span>
        <h2 id="wizard-step-1-heading" tabIndex={-1}>What should the group forecast?</h2>
        <p>Start from a familiar shape, then replace every placeholder with exact details.</p>
        <div className="template-grid" aria-label="Market templates" role="group">
          {MARKET_TEMPLATES.map((template) => (
            <button
              className={values.templateKey === template.key ? "template-card selected" : "template-card"}
              aria-pressed={values.templateKey === template.key}
              key={template.key}
              onClick={() => applyTemplate(template.key)}
              type="button"
            >
              <strong>{template.label}</strong>
              <small>{template.description}</small>
            </button>
          ))}
        </div>
        <div className="form-field">
          <label htmlFor="market-question">Binary question</label>
          <textarea
            id="market-question"
            maxLength={240}
            name="question"
            onChange={(event) => change({ question: event.target.value })}
            placeholder="Will our train arrive before 18:30 Europe/Budapest on 20 July 2026?"
            rows={3}
            value={values.question}
          />
          <small>{values.question.length}/240 · A precise date and threshold make settlement calmer.</small>
        </div>
      </section>

      <section className="wizard-step" hidden={activeStep !== 2} aria-labelledby="wizard-step-2-heading">
        <span className="card-kicker">Step 2 · Define</span>
        <h2 id="wizard-step-2-heading" tabIndex={-1}>Make every outcome understandable.</h2>
        <div className="form-field">
          <label htmlFor="yes-condition">What exact result counts as YES?</label>
          <textarea id="yes-condition" maxLength={1000} name="yesCondition" onChange={(event) => change({ yesCondition: event.target.value })} rows={4} value={values.yesCondition} />
        </div>
        <div className="form-field">
          <label htmlFor="no-condition">What exact result counts as NO?</label>
          <textarea id="no-condition" maxLength={1000} name="noCondition" onChange={(event) => change({ noCondition: event.target.value })} rows={4} value={values.noCondition} />
        </div>
        <div className="form-field">
          <label htmlFor="cancel-condition">When should everyone be refunded?</label>
          <textarea id="cancel-condition" maxLength={1000} name="cancelCondition" onChange={(event) => change({ cancelCondition: event.target.value })} rows={4} value={values.cancelCondition} />
        </div>
        <div className="form-field">
          <label htmlFor="resolution-source">Evidence source or observation method</label>
          <textarea id="resolution-source" maxLength={500} name="resolutionSourceText" onChange={(event) => change({ resolutionSourceText: event.target.value })} rows={3} value={values.resolutionSourceText} />
        </div>
        <div className="form-field">
          <label htmlFor="resolution-source-url">Source link <small>optional unless creator-final</small></label>
          <input id="resolution-source-url" maxLength={2048} name="resolutionSourceUrl" onChange={(event) => change({ resolutionSourceUrl: event.target.value })} placeholder="https://…" type="url" value={values.resolutionSourceUrl} />
        </div>
      </section>

      <section className="wizard-step" hidden={activeStep !== 3} aria-labelledby="wizard-step-3-heading">
        <span className="card-kicker">Step 3 · Time</span>
        <h2 id="wizard-step-3-heading" tabIndex={-1}>Set the clock explicitly.</h2>
        <p>These are interpreted in the IANA timezone below and stored as exact instants.</p>
        <div className="form-field">
          <label htmlFor="market-timezone">Timezone</label>
          <input id="market-timezone" list="timezone-suggestions" maxLength={100} name="timezone" onChange={(event) => change({ timezone: event.target.value })} placeholder="Europe/Budapest" value={values.timezone} />
          <datalist id="timezone-suggestions">
            {timezoneSuggestions.map((timezone) => <option key={timezone} value={timezone} />)}
          </datalist>
          <small>Use an IANA name. The timezone remains visible beside every deadline.</small>
        </div>
        <div className="form-field">
          <label htmlFor="trading-closes">Trading closes</label>
          <input id="trading-closes" max={seasonEndLocal || undefined} name="tradingClosesLocal" onChange={(event) => change({ tradingClosesLocal: event.target.value })} type="datetime-local" value={values.tradingClosesLocal} />
          {seasonEndLocal ? <small>Active season ends {seasonEndLocal.replace("T", " ")} {values.timezone}.</small> : null}
        </div>
        <div className="form-field">
          <label htmlFor="resolution-eligible">Earliest resolution</label>
          <input id="resolution-eligible" name="resolutionEligibleLocal" onChange={(event) => change({ resolutionEligibleLocal: event.target.value })} type="datetime-local" value={values.resolutionEligibleLocal} />
        </div>
      </section>

      <section className="wizard-step wizard-review" hidden={activeStep !== 4} aria-labelledby="wizard-step-4-heading">
        <span className="card-kicker">Step 4 · Review</span>
        <h2 id="wizard-step-4-heading" tabIndex={-1}>Confirm the contract before sharing.</h2>
        <div className="market-settings-grid">
          <div className="form-field">
            <label htmlFor="outcome-control">Can someone materially control the result?</label>
            <select
              id="outcome-control"
              name="outcomeControl"
              onChange={(event) => {
                const outcomeControl = event.target.value as MarketOutcomeControl;
                change({
                  outcomeControl,
                  resolutionMode: outcomeControl === "independent" ? values.resolutionMode : "disputable"
                });
              }}
              value={values.outcomeControl}
            >
              <option value="independent">No · independent result</option>
              <option value="creator_influenced">The creator can influence it</option>
              <option value="participant_influenced">A participant can influence it</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="resolution-mode">Dispute setting</label>
            <select
              id="resolution-mode"
              name="resolutionMode"
              onChange={(event) => {
                const resolutionMode = event.target.value as MarketResolutionMode;
                change({
                  creatorCanParticipate: resolutionMode === "creator_final" ? false : values.creatorCanParticipate,
                  resolutionMode
                });
              }}
              value={values.resolutionMode}
            >
              <option value="disputable">Creator proposal + one group dispute</option>
              <option disabled={values.outcomeControl !== "independent"} value="creator_final">Creator final · objective source only</option>
            </select>
          </div>
          <label className="toggle-field">
            <input
              checked={values.creatorCanParticipate}
              disabled={values.resolutionMode === "creator_final"}
              onChange={(event) => change({ creatorCanParticipate: event.target.checked })}
              type="checkbox"
            />
            <span><strong>Creator may take a position</strong><small>Disable this when the creator controls or judges the result.</small></span>
          </label>
        </div>

        {warnings.length ? (
          <aside className="clarity-panel" aria-labelledby="clarity-heading">
            <h3 id="clarity-heading">Clarity review</h3>
            <ul>
              {warnings.map((warning) => (
                <li key={warning.code}><strong>{warning.title}</strong><span>{warning.message}</span></li>
              ))}
            </ul>
          </aside>
        ) : (
          <p className="success-banner">No deterministic clarity warnings found. Read the full contract once more.</p>
        )}

        <MarketRulesPreview
          cancelCondition={values.cancelCondition}
          creatorCanParticipate={values.creatorCanParticipate}
          noCondition={values.noCondition}
          outcomeControl={values.outcomeControl}
          question={values.question}
          resolutionEligibleAt={resolutionEligibleAt}
          resolutionMode={values.resolutionMode}
          resolutionSourceText={values.resolutionSourceText}
          resolutionSourceUrl={values.resolutionSourceUrl || null}
          timezone={values.timezone}
          tradingClosesAt={tradingClosesAt}
          yesCondition={values.yesCondition}
        />
      </section>

      <div className="wizard-actions">
        {activeStep > 1 ? <button className="ghost-button" onClick={() => navigateToStep(Math.max(1, activeStep - 1))} type="button">Back</button> : <span />}
        {activeStep < 4 ? (
          <button className="primary-button" onClick={advance} type="button">Continue</button>
        ) : (
          <div className="wizard-submit-actions">
            <button className="ghost-button" disabled={isPending} name="intent" type="submit" value="draft">
              {isPending ? "Saving…" : "Save completed draft"}
            </button>
            <button className="primary-button" disabled={isPending} name="intent" type="submit" value="publish">
              {isPending ? "Publishing…" : "Publish market"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
