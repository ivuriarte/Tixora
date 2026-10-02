'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import type { StepId, StepMeta, StepStatus } from './types';

interface StepperProps {
  currentStep: StepId;
  steps: readonly StepMeta[];
  /** Status of every step except Review. */
  statuses: Partial<Record<StepId, StepStatus>>;
  /** Unmet publish requirements across all steps, summarized on the Review chip. */
  reviewIssueCount: number;
  /** Steps with unsaved changes (published events). */
  editedSteps?: ReadonlySet<StepId>;
  onJump: (step: StepId) => void;
}

type ChipState = 'current' | 'done' | 'needs_info' | 'not_started' | 'optional' | 'edited' | 'review';

const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'Done',
  needs_info: 'Needs info',
  not_started: 'Not started',
  optional: 'Optional',
};

function chipState(step: StepMeta, props: StepperProps): ChipState {
  if (step.id === props.currentStep) return 'current';
  if (props.editedSteps?.has(step.id)) return 'edited';
  if (step.id === 'review') return 'review';
  return props.statuses[step.id] ?? 'not_started';
}

function chipLabel(state: ChipState, reviewIssueCount: number, step: StepMeta, props: StepperProps): string {
  if (state === 'current') return 'Current';
  if (state === 'edited') return props.statuses[step.id] === 'needs_info' ? 'Edited · needs info' : 'Edited';
  if (state === 'review') {
    return reviewIssueCount === 0 ? 'Ready' : `${reviewIssueCount} ${reviewIssueCount === 1 ? 'item' : 'items'} left`;
  }
  return STATUS_LABEL[props.statuses[step.id] ?? 'not_started'];
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

const DOT_CLASS: Record<ChipState, string> = {
  current: 'border-primary bg-white text-primary',
  done: 'border-primary bg-primary text-white',
  needs_info: 'border-amber-500 bg-white text-amber-800',
  not_started: 'border-gray-300 bg-white text-gray-500',
  optional: 'border-gray-300 bg-white text-gray-500',
  edited: 'border-amber-500 bg-amber-50 text-amber-800',
  review: 'border-gray-300 bg-white text-gray-500',
};

const STATUS_TEXT_CLASS: Record<ChipState, string> = {
  current: 'text-primary',
  done: 'text-green-800',
  needs_info: 'text-amber-800',
  not_started: 'text-gray-500',
  optional: 'text-gray-500',
  edited: 'text-amber-800',
  review: 'text-gray-600',
};

function StepDot({ state, step }: { state: ChipState; step: StepMeta }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${DOT_CLASS[state]}`}
      aria-hidden
    >
      {state === 'done' ? <CheckIcon /> : state === 'needs_info' ? <AlertIcon /> : step.short}
    </span>
  );
}

export default function Stepper(props: StepperProps) {
  const { currentStep, steps, statuses, reviewIssueCount, onJump } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const currentIdx = Math.max(0, steps.findIndex((s) => s.id === currentStep));
  const counted = steps.filter((s) => s.id !== 'review');
  const ready = counted.filter((s) => statuses[s.id] === 'done' || statuses[s.id] === 'optional').length;
  const needsInfo = counted.filter((s) => statuses[s.id] === 'needs_info').length;
  const summary =
    needsInfo > 0
      ? `Needs info · ${needsInfo} ${needsInfo === 1 ? 'step needs' : 'steps need'} info`
      : `${ready} of ${counted.length} steps ready`;

  function jump(step: StepId) {
    setSheetOpen(false);
    onJump(step);
  }

  return (
    <nav aria-label="Event setup steps" className="w-full">
      {/* Desktop and tablet: every step is a button with its status in words. */}
      <ol className="hidden md:grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step) => {
          const state = chipState(step, props);
          const label = chipLabel(state, reviewIssueCount, step, props);
          const isCurrent = state === 'current';
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onJump(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${step.label}: ${label}`}
                className={`flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors hover:border-primary ${
                  isCurrent
                    ? 'border-2 border-primary bg-white'
                    : state === 'needs_info' || state === 'edited'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-[#e4dcf4] bg-white'
                }`}
              >
                <StepDot state={state} step={step} />
                <span className={`text-xs leading-tight ${isCurrent ? 'font-semibold text-primary' : 'text-gray-700'}`}>
                  {step.label}
                </span>
                <span className={`text-[11px] font-semibold leading-tight ${STATUS_TEXT_CLASS[state]}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Phones: one-line step bar, a text summary, and a sheet listing every step. */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[#1a0533]">
            <span className="font-semibold">
              Step {currentIdx + 1} of {steps.length}
            </span>{' '}
            · {steps[currentIdx]?.label}
          </p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            className="min-h-[44px] shrink-0 rounded-[40px] border border-[#d3c8e8] px-4 text-xs font-bold text-[#4f416c] hover:border-primary hover:text-primary"
          >
            All steps
          </button>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
          {steps.map((step) => {
            const state = chipState(step, props);
            const color =
              state === 'current'
                ? 'bg-[#4c1d95]'
                : state === 'done' || state === 'optional'
                ? 'bg-primary'
                : state === 'needs_info' || state === 'edited'
                ? 'bg-amber-500'
                : 'bg-[#e6def5]';
            return <span key={step.id} className={`h-1.5 rounded-full ${color}`} />;
          })}
        </div>
        <p className={`text-xs ${needsInfo > 0 ? 'text-amber-800' : 'text-[#6b5b8a]'}`}>{summary}</p>
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="All steps">
        <ul className="divide-y divide-[#e4dcf4]">
          {steps.map((step) => {
            const state = chipState(step, props);
            const label = chipLabel(state, reviewIssueCount, step, props);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => jump(step.id)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 py-2 text-left text-sm"
                >
                  <span className={`flex items-center gap-3 ${state === 'current' ? 'font-semibold text-primary' : 'text-[#1a0533]'}`}>
                    <StepDot state={state} step={step} />
                    {step.label}
                  </span>
                  <span className={`text-xs font-semibold ${STATUS_TEXT_CLASS[state]}`}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          className="mt-4 min-h-[44px] w-full rounded-[40px] border border-[#d3c8e8] text-sm font-bold text-[#4f416c] hover:border-primary hover:text-primary"
        >
          Close
        </button>
      </Modal>
    </nav>
  );
}
