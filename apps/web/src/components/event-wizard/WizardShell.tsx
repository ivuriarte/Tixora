'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Stepper from './Stepper';
import EventPreview from './EventPreview';
import { STEPS, type StepId, type EventDraft, type LocalPaymentMethod, type LocalTier, validateStep } from './types';

export interface WizardShellProps {
  title: string;
  draft: EventDraft;
  tiers: LocalTier[];
  paymentMethods: LocalPaymentMethod[];
  /** rendered for the active step. `jump` lets the Review step navigate back. */
  renderStep: (step: StepId, jump: (s: StepId) => void) => ReactNode;
  /** label of the final action button (e.g. "Create Event" or "Save Changes") */
  submitLabel: string;
  /** called when user clicks submit on the Review step */
  onSubmit: () => void;
  /** called when user clicks Cancel */
  onCancel: () => void;
  submitting?: boolean;
  /** optional indicator to show in the top bar (e.g. "Draft saved 3s ago") */
  statusIndicator?: ReactNode;
  /** optional banner at the top (e.g. restore-draft prompt) */
  topBanner?: ReactNode;
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
  submitting = false,
  statusIndicator,
  topBanner,
}: WizardShellProps) {
  const [step, setStep] = useState<StepId>('basics');
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);

  const activeSteps = useMemo(
    () => draft.isFree ? STEPS.filter((item) => item.id !== 'payment') : [...STEPS],
    [draft.isFree],
  );
  const safeStep = activeSteps.some((item) => item.id === step) ? step : 'review';
  const currentIdx = activeSteps.findIndex((s) => s.id === safeStep);
  const currentStep = activeSteps[currentIdx];
  const isLast = safeStep === 'review';

  const validationError = validateStep(safeStep, draft, tiers, paymentMethods);
  const optionalStep = !!currentStep.optional;
  // Optional steps can always advance. Required steps need to validate.
  const canAdvance = optionalStep || !validationError;

  function handleNext() {
    setAttemptedNext(true);
    if (!canAdvance) return;
    if (!optionalStep) {
      setCompleted((prev) => new Set(prev).add(safeStep));
    } else {
      setCompleted((prev) => new Set(prev).add(safeStep));
    }
    if (!isLast) {
      setStep(activeSteps[currentIdx + 1].id);
      setAttemptedNext(false);
      // Scroll form to top on step change
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleBack() {
    if (currentIdx === 0) return;
    setStep(activeSteps[currentIdx - 1].id);
    setAttemptedNext(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleJump(target: StepId) {
    setStep(target);
    setAttemptedNext(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSubmit() {
    // Re-validate all required steps before final submit
    for (const s of activeSteps) {
      if (s.optional) continue;
      const err = validateStep(s.id, draft, tiers, paymentMethods);
      if (err) {
        setStep(s.id);
        setAttemptedNext(true);
        return;
      }
    }
    onSubmit();
  }

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
          <Stepper steps={activeSteps} currentStep={safeStep} completedSteps={completed} onJump={handleJump} />
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
            <div key={safeStep} className="animate-fade-in space-y-5">
              {renderStep(safeStep, handleJump)}
            </div>

            {/* Inline validation error */}
            {attemptedNext && validationError && !optionalStep && (
              <div className="mt-6 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{validationError}</span>
              </div>
            )}

            {/* Nav buttons */}
            <div className="mt-8 pt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] px-3 text-sm font-medium text-[#756a92] hover:text-primary"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2 ml-auto">
                {currentIdx > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="axon-pill border border-[#d3c8e8] text-xs text-[#4f416c] hover:border-primary hover:text-primary"
                  >
                    ← Back
                  </button>
                )}
                {!isLast ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canAdvance}
                    title={!canAdvance && validationError ? validationError : undefined}
                    aria-disabled={!canAdvance}
                    className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    {submitting ? 'Working…' : submitLabel}
                  </button>
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
