'use client';

import { useState, type ReactNode } from 'react';
import Stepper from './Stepper';
import EventPreview from './EventPreview';
import { STEPS, type StepId, type EventDraft, type LocalTier, validateStep } from './types';

export interface WizardShellProps {
  title: string;
  draft: EventDraft;
  tiers: LocalTier[];
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

  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const currentStep = STEPS[currentIdx];
  const isLast = step === 'review';

  const validationError = validateStep(step, draft, tiers);
  const optionalStep = !!currentStep.optional;
  // Optional steps can always advance. Required steps need to validate.
  const canAdvance = optionalStep || !validationError;

  function handleNext() {
    setAttemptedNext(true);
    if (!canAdvance) return;
    if (!optionalStep) {
      setCompleted((prev) => new Set(prev).add(step));
    } else {
      setCompleted((prev) => new Set(prev).add(step));
    }
    if (!isLast) {
      setStep(STEPS[currentIdx + 1].id);
      setAttemptedNext(false);
      // Scroll form to top on step change
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleBack() {
    if (currentIdx === 0) return;
    setStep(STEPS[currentIdx - 1].id);
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
    for (const s of STEPS) {
      if (s.optional) continue;
      const err = validateStep(s.id, draft, tiers);
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <div className="flex items-center gap-3">
            {statusIndicator}
            <button
              type="button"
              onClick={() => setShowPreviewMobile((v) => !v)}
              className="lg:hidden text-xs font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5"
            >
              {showPreviewMobile ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
        </div>

        {topBanner}

        {/* Stepper */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4">
          <Stepper currentStep={step} completedSteps={completed} onJump={handleJump} />
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 min-h-[300px]">
            {/* Step header */}
            <div className="mb-6 pb-4 border-b border-gray-100">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">
                Step {currentIdx + 1} of {STEPS.length}
                {currentStep.optional && <span className="ml-2 text-gray-400 normal-case">(optional)</span>}
              </p>
              <h2 className="text-xl font-semibold text-gray-900 mt-1">{currentStep.label}</h2>
            </div>

            {/* Animated step content */}
            <div key={step} className="animate-fade-in space-y-5">
              {renderStep(step, handleJump)}
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
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2 ml-auto">
                {currentIdx > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
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
                    className="bg-primary text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary transition-colors"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-primary text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors"
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
