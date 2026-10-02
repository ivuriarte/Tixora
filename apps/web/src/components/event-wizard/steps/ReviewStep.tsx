'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { EventDraft, LocalPaymentMethod, LocalTier, StepId } from '../types';
import { STEPS, combineDatetime, publishIssues, validateStep } from '../types';

interface ReviewStepProps {
  draft: EventDraft;
  tiers: LocalTier[];
  paymentMethods: LocalPaymentMethod[];
  onJump: (s: StepId) => void;
  /** heading for the checklist, e.g. "Ready to publish?" */
  heading?: string;
  /** action rendered under the checklist, e.g. the Publish event button */
  action?: ReactNode;
  /** set after a publish attempt with items left; moves focus to the checklist */
  publishBlocked?: boolean;
  /** messages returned by the server when it refused to publish */
  serverIssues?: string[];
}

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
    });
  } catch {
    return '—';
  }
}

function Section({
  title, onEdit, hasError, children,
}: {
  title: string;
  onEdit?: () => void;
  hasError?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${hasError ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {title}
          {hasError && (
            <span className="text-[10px] uppercase tracking-wider text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Needs attention</span>
          )}
        </h3>
        {onEdit && <button type="button" onClick={onEdit} className="text-xs text-primary hover:underline font-medium">Edit</button>}
      </div>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  );
}

export default function ReviewStep({
  draft,
  tiers,
  paymentMethods,
  onJump,
  heading = 'Ready to publish?',
  action,
  publishBlocked = false,
  serverIssues = [],
}: ReviewStepProps) {
  const steps = draft.isFree ? STEPS.filter((s) => s.id !== 'payment') : STEPS;
  const issues = publishIssues(steps, draft, tiers, paymentMethods);
  const checklistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (publishBlocked) checklistRef.current?.focus();
  }, [publishBlocked]);
  const stepLabel = (id: StepId) => STEPS.find((s) => s.id === id)?.label ?? id;
  const issueSteps = steps.filter((s) => issues.some((issue) => issue.step === s.id));
  const leftCount = issues.length + serverIssues.length;

  const startsAt = combineDatetime(draft.startDate, draft.startTime);
  const endsAt = combineDatetime(draft.endDate, draft.endTime);

  const basicsErr = validateStep('basics', draft, tiers);
  const locationErr = validateStep('location', draft, tiers);
  const capacityErr = validateStep('capacity', draft, tiers);
  const paymentErr = validateStep('payment', draft, tiers, paymentMethods);

  return (
    <>
      <div
        ref={checklistRef}
        tabIndex={-1}
        aria-labelledby="publish-checklist-heading"
        className="rounded-xl border border-[#e4dcf4] bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h3 id="publish-checklist-heading" className="text-base font-semibold text-[#1a0533]">
          {leftCount === 0
            ? "Everything's ready."
            : `${heading} ${leftCount} ${leftCount === 1 ? 'thing' : 'things'} left`}
        </h3>
        {(publishBlocked || serverIssues.length > 0) && leftCount > 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">This event isn&apos;t ready to publish.</p>
            <p>Fix the {leftCount === 1 ? 'item' : `${leftCount} items`} below, then publish again.</p>
          </div>
        )}
        {leftCount === 0 ? (
          <p className="mt-1 text-sm text-gray-600">Every required step is complete.</p>
        ) : (
          <div className="mt-2 divide-y divide-[#e4dcf4]">
            {serverIssues.length > 0 && (
              <div className="py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">From the server</p>
                <ul className="mt-1 space-y-1 text-sm text-amber-800">
                  {serverIssues.map((message, index) => <li key={index}>{message}</li>)}
                </ul>
              </div>
            )}
            {issueSteps.map((s) => (
              <div key={s.id} className="py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</p>
                <ul className="mt-1 space-y-1">
                  {issues
                    .filter((issue) => issue.step === s.id)
                    .map((issue, index) => (
                      <li key={`${issue.step}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
                        <span className="flex min-w-0 items-start gap-2 text-amber-800">
                          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" d="M12 7.5v5M12 16h.01" />
                          </svg>
                          <span>{issue.message}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onJump(issue.step)}
                          aria-label={`Fix: ${issue.message} (${stepLabel(issue.step)})`}
                          className="min-h-[44px] shrink-0 px-1 text-xs font-semibold text-primary hover:underline"
                        >
                          Fix in {stepLabel(issue.step)} →
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {action && <div className="mt-4 flex flex-wrap justify-end gap-2">{action}</div>}
      </div>

      <h3 className="pt-2 text-sm font-semibold text-gray-900">Summary</h3>

      <div className="space-y-3">
        <Section title="Basics" onEdit={() => onJump('basics')} hasError={!!basicsErr}>
          <p><span className="text-gray-500">Title:</span> {draft.title || <em className="text-gray-400">missing</em>}</p>
          <p className="whitespace-pre-line"><span className="text-gray-500">Description:</span> {draft.description || <em className="text-gray-400">missing</em>}</p>
          {draft.imageUrl && <p className="text-xs text-gray-500 truncate">Cover: {draft.imageUrl}</p>}
        </Section>

        <Section title="Location & Schedule" onEdit={() => onJump('location')} hasError={!!locationErr}>
          <p>{draft.venue || <em className="text-gray-400">no venue</em>} · {draft.city || <em className="text-gray-400">no city</em>}</p>
          {draft.address && <p className="text-gray-500 text-xs">{draft.address}</p>}
          {draft.landmark && <p className="text-xs italic text-gray-500">Landmark: {draft.landmark}</p>}
          <p className="pt-1"><span className="text-gray-500">Starts:</span> {fmt(startsAt)}</p>
          {endsAt && <p><span className="text-gray-500">Ends:</span> {fmt(endsAt)}</p>}
        </Section>

        <Section title="Capacity & Tiers" onEdit={() => onJump('capacity')} hasError={!!capacityErr}>
          <p><span className="text-gray-500">Max capacity:</span> {draft.maxCapacity || '0'}</p>
          {draft.isFree && <p className="text-emerald-700"><span className="font-semibold">Free event:</span> no ticket amount or platform fee</p>}
          {tiers.length === 0 ? (
            <em className="text-gray-400">No tiers yet</em>
          ) : (
            <ul className="mt-1 space-y-1">
              {tiers.map((t) => (
                <li key={t.key} className="flex items-center justify-between text-xs">
                  <span>• {t.name} <span className="text-gray-400">({t.totalQuantity} qty{t.inclusions.length > 0 ? `, ${t.inclusions.length} included benefit${t.inclusions.length === 1 ? '' : 's'}` : ''})</span></span>
                  <span className="font-semibold text-primary">{draft.isFree ? 'Free' : `₱${(parseFloat(t.price) || 0).toLocaleString()}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Event Program & Details (optional)" onEdit={() => onJump('details')}>
          {!draft.speakerName && draft.agenda.length === 0 && draft.sponsors.length === 0 && draft.faqs.length === 0 ? (
            <em className="text-gray-400 text-xs">Skipped</em>
          ) : (
            <ul className="text-xs space-y-0.5">
              {draft.speakerName && <li>🎤 Speaker: {draft.speakerName}</li>}
              {draft.agenda.length > 0 && <li>📋 {draft.agenda.length} agenda item{draft.agenda.length === 1 ? '' : 's'}</li>}
              {draft.sponsors.length > 0 && <li>🤝 {draft.sponsors.length} sponsor{draft.sponsors.length === 1 ? '' : 's'}</li>}
              {draft.faqs.length > 0 && <li>❓ {draft.faqs.length} FAQ{draft.faqs.length === 1 ? '' : 's'}</li>}
              {draft.customSections.length > 0 && <li>{draft.customSections.length} custom detail block{draft.customSections.length === 1 ? '' : 's'}</li>}
            </ul>
          )}
        </Section>

        <Section
          title={draft.isFree ? 'Payment Methods (skipped)' : 'Payment Methods (required)'}
          onEdit={draft.isFree ? undefined : () => onJump('payment')}
          hasError={!draft.isFree && !!paymentErr}
        >
          {paymentMethods.length === 0 ? (
            <em className={draft.isFree ? 'text-gray-400 text-xs' : 'text-xs font-semibold text-red-600'}>
              {draft.isFree ? 'Not required for this free event' : 'Add a payment method before publishing'}
            </em>
          ) : (
            <ul className="text-xs space-y-0.5">
              {paymentMethods.map((pm) => (
                <li key={pm.key}>{pm.type === 'bank' ? '🏦' : '📱'} {pm.name || '(no name)'}{pm.accountNumber ? ` · ${pm.accountNumber}` : ''}</li>
              ))}
            </ul>
          )}
        </Section>

      </div>
    </>
  );
}
