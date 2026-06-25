'use client';

import type { EventDraft, LocalPaymentMethod, LocalTier, StepId } from '../types';
import { combineDatetime, validateStep } from '../types';

interface ReviewStepProps {
  draft: EventDraft;
  tiers: LocalTier[];
  paymentMethods: LocalPaymentMethod[];
  onJump: (s: StepId) => void;
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
  onEdit: () => void;
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
        <button type="button" onClick={onEdit} className="text-xs text-primary hover:underline font-medium">Edit</button>
      </div>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  );
}

export default function ReviewStep({ draft, tiers, paymentMethods, onJump }: ReviewStepProps) {
  const startsAt = combineDatetime(draft.startDate, draft.startTime);
  const endsAt = combineDatetime(draft.endDate, draft.endTime);

  const basicsErr = validateStep('basics', draft, tiers);
  const locationErr = validateStep('location', draft, tiers);
  const capacityErr = validateStep('capacity', draft, tiers);

  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Review everything before publishing. Click <strong>Edit</strong> on any section to jump back.
      </p>

      <div className="space-y-3">
        <Section title="Basics" onEdit={() => onJump('basics')} hasError={!!basicsErr}>
          <p><span className="text-gray-500">Title:</span> {draft.title || <em className="text-gray-400">missing</em>}</p>
          <p className="whitespace-pre-line"><span className="text-gray-500">Description:</span> {draft.description || <em className="text-gray-400">missing</em>}</p>
          {draft.imageUrl && <p className="text-xs text-gray-500 truncate">Cover: {draft.imageUrl}</p>}
        </Section>

        <Section title="Location & Schedule" onEdit={() => onJump('location')} hasError={!!locationErr}>
          <p>{draft.venue || <em className="text-gray-400">no venue</em>} · {draft.city || <em className="text-gray-400">no city</em>}</p>
          {draft.address && <p className="text-gray-500 text-xs">{draft.address}</p>}
          {draft.landmark && <p className="text-gray-500 text-xs italic">📍 {draft.landmark}</p>}
          <p className="pt-1"><span className="text-gray-500">Starts:</span> {fmt(startsAt)}</p>
          {endsAt && <p><span className="text-gray-500">Ends:</span> {fmt(endsAt)}</p>}
        </Section>

        <Section title="Capacity & Tiers" onEdit={() => onJump('capacity')} hasError={!!capacityErr}>
          <p><span className="text-gray-500">Max capacity:</span> {draft.maxCapacity || '0'}</p>
          {tiers.length === 0 ? (
            <em className="text-gray-400">No tiers yet</em>
          ) : (
            <ul className="mt-1 space-y-1">
              {tiers.map((t) => (
                <li key={t.key} className="flex items-center justify-between text-xs">
                  <span>• {t.name} <span className="text-gray-400">({t.totalQuantity} qty)</span></span>
                  <span className="font-semibold text-primary">₱{(parseFloat(t.price) || 0).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Conference (optional)" onEdit={() => onJump('conference')}>
          {!draft.speakerName && draft.agenda.length === 0 && draft.sponsors.length === 0 && draft.faqs.length === 0 ? (
            <em className="text-gray-400 text-xs">Skipped</em>
          ) : (
            <ul className="text-xs space-y-0.5">
              {draft.speakerName && <li>🎤 Speaker: {draft.speakerName}</li>}
              {draft.agenda.length > 0 && <li>📋 {draft.agenda.length} agenda item{draft.agenda.length === 1 ? '' : 's'}</li>}
              {draft.sponsors.length > 0 && <li>🤝 {draft.sponsors.length} sponsor{draft.sponsors.length === 1 ? '' : 's'}</li>}
              {draft.faqs.length > 0 && <li>❓ {draft.faqs.length} FAQ{draft.faqs.length === 1 ? '' : 's'}</li>}
            </ul>
          )}
        </Section>

        <Section title="Payment Methods (optional)" onEdit={() => onJump('payment')}>
          {paymentMethods.length === 0 ? (
            <em className="text-gray-400 text-xs">Skipped</em>
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
