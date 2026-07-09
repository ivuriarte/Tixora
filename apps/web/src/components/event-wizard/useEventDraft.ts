'use client';

import { useEffect, useState } from 'react';
import type { EventDraft, LocalPaymentMethod, LocalTier } from './types';
import { emptyDraft } from './types';

const DRAFT_KEY = 'tixora:event-wizard:draft:v1';

type Persisted = {
  draft: EventDraft;
  tiers: LocalTier[];
  // qrFile is a File object — not serializable, so we drop it on save
  paymentMethods: Array<Omit<LocalPaymentMethod, 'qrFile'>>;
  savedAt: number;
};

export function loadDraft(): Persisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Persisted;
    return {
      ...saved,
      draft: { ...emptyDraft(), ...saved.draft },
      tiers: saved.tiers.map((tier) => ({ ...tier, inclusions: tier.inclusions ?? [] })),
    };
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}

export function useAutosaveDraft(
  draft: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[],
  enabled: boolean,
) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    // Don't save an empty draft
    const isEmpty =
      draft.title === '' &&
      draft.description === '' &&
      draft.venue === '' &&
      tiers.length === 0 &&
      paymentMethods.length === 0;
    if (isEmpty) return;

    const t = setTimeout(() => {
      try {
        const persisted: Persisted = {
          draft,
          tiers,
          paymentMethods: paymentMethods.map(({ qrFile: _qrFile, ...rest }) => rest),
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(persisted));
        setSavedAt(persisted.savedAt);
      } catch {
        /* quota or serialization issue — ignore */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [draft, tiers, paymentMethods, enabled]);

  return savedAt;
}

export function newEmptyState() {
  return { draft: emptyDraft(), tiers: [] as LocalTier[], paymentMethods: [] as LocalPaymentMethod[] };
}
