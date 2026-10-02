'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Stepper from './Stepper';
import EventPreview from './EventPreview';
import {
  STEPS,
  publishIssues,
  stepIssues,
  stepStatus,
  type StepId,
  type StepStatus,
  type EventDraft,
  type LocalPaymentMethod,
  type LocalTier,
} from './types';

export interface WizardShellProps {
  title: string;
  draft: EventDraft;
  tiers: LocalTier[];
  paymentMethods: LocalPaymentMethod[];
  /** rendered for the active step. `jump` lets the Review step navigate to any step. */
  renderStep: (step: StepId, jump: (s: StepId) => void) => ReactNode;
  /** label of the save action (e.g. "Create Event" or "Save changes") */
  submitLabel: string;
  onSubmit: () => void;
  /** called when the user leaves with the back-to-list button */
  onCancel: () => void;
  cancelLabel?: string;
  submitting?: boolean;
  /** indicator shown in the header (e.g. "Draft saved" or "Unsaved changes") */
  statusIndicator?: ReactNode;
  /** optional banner at the top (e.g. restore prompt) */
  topBanner?: ReactNode;
  /** renders event fields for reference without allowing mutations */
  readOnly?: boolean;
  /** shows the save action in the footer of every step, not only Review */
  submitOnEveryStep?: boolean;
  /** when true, saving is blocked until every required step is complete */
  requireCompleteToSubmit?: boolean;
  /** steps with unsaved changes, marked "Edited" in the stepper */
  editedSteps?: ReadonlySet<StepId>;
  /** called whenever the visible step changes */
  onStepChange?: (step: StepId) => void;
}

export default function WizardShell({
  title,
  draft,
  tiers,
  paymentMethods,
  renderStep,
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel = 'Back to events',
  submitting = false,
  statusIndicator,
  topBanner,
  readOnly = false,
  submitOnEveryStep = false,
  requireCompleteToSubmit = true,
  editedSteps,
  onStepChange,
}: WizardShellProps) {
  const [step, setStep] = useState<StepId>('basics');
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(new Set());
  const [blockedSubmit, setBlockedSubmit] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);

  const activeSteps = useMemo(
    () => (draft.isFree ? STEPS.filter((item) => item.id !== 'payment') : [...STEPS]),
    [draft.isFree],
  );
  const safeStep = activeSteps.some((item) => item.id === step) ? step : 'review';
  const currentIdx = activeSteps.findIndex((s) => s.id === safeStep);
  const currentStep = activeSteps[currentIdx];
  const isLast = safeStep === 'review';

  const statuses = useMemo(() => {
    const result: Partial<Record<StepId, StepStatus>> = {};
    for (const s of activeSteps) {
      if (s.id !== 'review') result[s.id] = stepStatus(s.id, draft, tiers, paymentMethods);
    }
    return result;
  }, [activeSteps, draft, tiers, paymentMethods]);
  const reviewIssueCount = useMemo(
    () => publishIssues(activeSteps, draft, tiers, paymentMethods).length,
    [activeSteps, draft, tiers, paymentMethods],
  );

  const currentIssues = stepIssues(safeStep, draft, tiers, paymentMethods);
  const showIssues =
    !readOnly &&
    currentIssues.length > 0 &&
    (blockedSubmit || (visited.has(safeStep) && statuses[safeStep] !== 'not_started'));

  function goTo(target: StepId) {
    setVisited((prev) => new Set(prev).add(safeStep));
    setStep(target);
    onStepChange?.(target);
    setBlockedSubmit(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleNext() {
    if (!isLast) goTo(activeSteps[currentIdx + 1].id);
  }

  function handleBack() {
    if (currentIdx > 0) goTo(activeSteps[currentIdx - 1].id);
  }

  function handleSubmit() {
    if (requireCompleteToSubmit) {
      const firstBlocked = activeSteps.find(
        (s) => !s.optional && stepIssues(s.id, draft, tiers, paymentMethods).length > 0,
      );
      if (firstBlocked) {
        setVisited((prev) => new Set(prev).add(safeStep));
        setStep(firstBlocked.id);
        onStepChange?.(firstBlocked.id);
        setBlockedSubmit(true);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    onSubmit();
  }

  const submitButton = (primary: boolean) => (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={submitting}
      className={`axon-pill text-xs disabled:opacity-50 ${
        primary
          ? 'bg-primary text-white hover:bg-primary-hover'
          : 'border border-[#d3c8e8] text-[#4f416c] hover:border-primary hover:text-primary'
      }`}
    >
      {submitLabel}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 py-6 lg:py-10">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="axon-page-title text-3xl sm:text-4xl">{title}</h1>
          <div className="flex items-center gap-3">
            {statusIndicator}
            <button
              type="button"
              onClick={() => setShowPreviewMobile((v) => !v)}
              className="min-h-[44px] rounded-[40px] border border-primary/30 px-4 text-xs font-bold uppercase tracking-wide text-primary lg:hidden"
            >
              {showPreviewMobile ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
        </div>

        {topBanner}

        {/* Stepper */}
        <div className="mb-4 rounded-lg border border-[#e4dcf4] bg-white p-4 sm:p-6">
          <Stepper
            steps={activeSteps}
            currentStep={safeStep}
            statuses={statuses}
            reviewIssueCount={reviewIssueCount}
            editedSteps={editedSteps}
            onJump={goTo}
          />
        </div>

        {/* Mobile preview drawer */}
        {showPreviewMobile && (
          <div className="lg:hidden mb-4">
            <EventPreview draft={draft} tiers={tiers} />
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Form column */}
          <div className="min-h-[300px] rounded-lg border border-[#e4dcf4] bg-white p-6 sm:p-8">
            {/* Step header */}
            <div className="mb-6 pb-4 border-b border-gray-100">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">
                Step {currentIdx + 1} of {activeSteps.length}
                {currentStep.optional && <span className="ml-2 text-gray-400 normal-case">(optional)</span>}
              </p>
              <h2 className="axon-section-title mt-2 text-lg">{currentStep.label}</h2>
            </div>

            {/* Animated step content */}
            <div key={safeStep} className={`animate-fade-in space-y-5 ${readOnly ? 'pointer-events-none opacity-80' : ''}`} aria-readonly={readOnly}>
              {renderStep(safeStep, goTo)}
            </div>

            {/* What this step still needs. Never blocks moving between steps. */}
            {showIssues && (
              <div
                role={blockedSubmit ? 'alert' : 'status'}
                className={`mt-6 rounded-lg border px-3 py-2 text-sm ${
                  blockedSubmit ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <p className="font-semibold">
                  {blockedSubmit ? `Fix ${currentIssues.length === 1 ? 'this' : 'these'} before saving:` : 'Still needed before publishing:'}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {currentIssues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nav buttons */}
            <div className="mt-8 pt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] px-3 text-sm font-medium text-[#756a92] hover:text-primary"
              >
                {cancelLabel}
              </button>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {currentIdx > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="axon-pill border border-[#d3c8e8] text-xs text-[#4f416c] hover:border-primary hover:text-primary"
                  >
                    ← Back
                  </button>
                )}
                {!readOnly && submitOnEveryStep && !isLast && submitButton(false)}
                {!isLast ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover"
                  >
                    Next →
                  </button>
                ) : readOnly ? (
                  <span className="axon-pill border border-gray-200 bg-gray-50 text-xs text-gray-500">View only</span>
                ) : (
                  submitButton(true)
                )}
              </div>
            </div>
          </div>

          {/* Desktop preview column */}
          <div className="hidden lg:block sticky top-6">
            <EventPreview draft={draft} tiers={tiers} />
          </div>
        </div>
      </main>
    </div>
  );
}
