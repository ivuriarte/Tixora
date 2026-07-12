'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { EventDraft } from '../types';

interface FeaturedEvent {
  id: string;
  title: string;
  featuredOrder: number | null;
  featuredUntil: string | null;
  startsAt: string;
  tagline: string | null;
}

interface FeaturedStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  /** When editing an existing event, pass its id so we can exclude it from the list */
  currentEventId?: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
    });
  } catch {
    return null;
  }
}

export default function FeaturedStep({ draft, update, currentEventId }: FeaturedStepProps) {
  const [existingFeatured, setExistingFeatured] = useState<FeaturedEvent[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  useEffect(() => {
    setLoadingFeatured(true);
    api
      .get<{ data: FeaturedEvent[] }>('/events/featured')
      .then((res) => {
        const events = res.data.data ?? [];
        setExistingFeatured(
          currentEventId ? events.filter((e) => e.id !== currentEventId) : events,
        );
      })
      .catch(() => {})
      .finally(() => setLoadingFeatured(false));
  }, [currentEventId]);

  const usedSlots = existingFeatured.length;
  const takenOrders = existingFeatured
    .map((e) => e.featuredOrder)
    .filter((o): o is number => o !== null);

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
        <div>
          <p className="text-sm font-semibold text-gray-900">Feature on Homepage</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Featured events appear in the animated hero carousel on the homepage, giving them prime visibility.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={draft.isFeatured}
            onChange={(e) => update({ isFeatured: e.target.checked })}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
        </label>
      </div>

      {/* Featured settings — only when enabled */}
      {draft.isFeatured && (
        <div className="space-y-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40">
          {/* Tagline */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Tagline <span className="text-gray-400 font-normal">(optional — shown as badge above the event title)</span>
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. FULL-DAY LEADERSHIP CONFERENCE"
              value={draft.tagline}
              onChange={(e) => update({ tagline: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-xs text-gray-400 mt-1">{draft.tagline.length}/100 characters</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Display order */}
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Display order <span className="text-gray-400 font-normal">(1 = first slot)</span>
              </label>
              <input
                type="number"
                min={1}
                placeholder="1"
                value={draft.featuredOrder}
                onChange={(e) => update({ featuredOrder: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {takenOrders.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Slots already in use: {takenOrders.sort((a, b) => a - b).join(', ')}
                </p>
              )}
            </div>

            {/* Featured until */}
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Featured until <span className="text-gray-400 font-normal">(leave blank = no expiry)</span>
              </label>
              <input
                type="date"
                value={draft.featuredUntil}
                onChange={(e) => update({ featuredUntil: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Existing featured events */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          Currently featured events
          {loadingFeatured && (
            <svg className="animate-spin w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
        </h3>

        {!loadingFeatured && existingFeatured.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center">
            <p className="text-sm text-gray-400">No events are currently featured on the homepage.</p>
            <p className="text-xs text-gray-400 mt-0.5">Enable the toggle above to make this the first featured event.</p>
          </div>
        )}

        {existingFeatured.length > 0 && (
          <div className="space-y-2">
            {existingFeatured.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                  {e.tagline && (
                    <p className="text-xs text-indigo-600 truncate mt-0.5">{e.tagline}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                  {e.featuredOrder !== null && (
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded-full">
                      Slot {e.featuredOrder}
                    </span>
                  )}
                  {e.featuredUntil && (
                    <span>Until {fmtDate(e.featuredUntil)}</span>
                  )}
                  {!e.featuredUntil && (
                    <span className="text-gray-400">No expiry</span>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-1">
              {usedSlots} event{usedSlots !== 1 ? 's' : ''} currently in the homepage hero.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
