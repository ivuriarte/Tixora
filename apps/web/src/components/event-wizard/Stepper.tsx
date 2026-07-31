'use client';

import type { StepId, StepMeta } from './types';

interface StepperProps {
  currentStep: StepId;
  steps: readonly StepMeta[];
  completedSteps: Set<StepId>;
  onJump: (step: StepId) => void;
}

export default function Stepper({ currentStep, completedSteps, onJump, steps }: StepperProps) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center justify-between gap-1 sm:gap-2">
        {steps.map((step, idx) => {
          const isComplete = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isPast = idx < currentIdx;
          const canClick = isComplete || isPast || isCurrent;

          return (
            <li key={step.id} className="flex-1 flex flex-col items-center">
              <button
                type="button"
                disabled={!canClick}
                onClick={() => canClick && onJump(step.id)}
                className={`group relative w-full flex flex-col items-center gap-1 px-1 py-1 rounded-lg ${
                  canClick ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold border-2 transition-all ${
                    isCurrent
                      ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30 scale-110'
                      : isComplete
                      ? 'bg-primary text-white border-primary'
                      : isPast
                      ? 'bg-white text-primary border-primary'
                      : 'bg-white text-gray-400 border-gray-300'
                  }`}
                >
                  {isComplete && !isCurrent ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.short
                  )}
                </div>
                <span
                  className={`text-[11px] sm:text-xs text-center leading-tight hidden sm:block ${
                    isCurrent ? 'text-primary font-semibold' : isComplete || isPast ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div className="hidden sm:block absolute" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      {/* Progress bar underneath */}
      <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500 text-center sm:hidden">
        Step {currentIdx + 1} of {steps.length} · {steps[currentIdx].label}
      </p>
    </nav>
  );
}
