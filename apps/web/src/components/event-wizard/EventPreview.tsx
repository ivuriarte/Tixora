'use client';

import Image from 'next/image';
import type { EventDraft, LocalTier } from './types';
import { combineDatetime } from './types';

interface EventPreviewProps {
  draft: EventDraft;
  tiers: LocalTier[];
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    });
  } catch {
    return '';
  }
}

export default function EventPreview({ draft, tiers }: EventPreviewProps) {
  const startsAt = combineDatetime(draft.startDate, draft.startTime);
  const endsAt = combineDatetime(draft.endDate, draft.endTime);
  const minPrice = draft.isFree
    ? 0
    : tiers.length > 0
    ? Math.min(...tiers.map((t) => parseFloat(t.price) || 0))
    : null;
  const maxCap = parseInt(draft.maxCapacity, 10) || 0;
  const totalTier = tiers.reduce((s, t) => s + (parseInt(t.totalQuantity, 10) || 0), 0);

  return (
    <aside
      aria-label="Live event preview"
      className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
    >
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden />
          <h3 className="text-sm font-semibold text-gray-900">Live Preview</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">As attendees will see</span>
      </div>

      <div className="p-4 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
        {/* Event card hero */}
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          {draft.imageUrl ? (
            <Image
              src={draft.imageUrl}
              alt=""
              width={400}
              height={128}
              className="w-full h-32 object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-32 bg-gradient-to-br from-primary/20 via-violet-100 to-purple-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="p-3 space-y-2">
            <h4 className="font-bold text-gray-900 text-base leading-tight line-clamp-2">
              {draft.title || <span className="text-gray-300 italic">Event title appears here</span>}
            </h4>
            {startsAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(startsAt)}
              </div>
            )}
            {(draft.venue || draft.city) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">
                  {[draft.venue, draft.city].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {minPrice !== null && (
              <div className="pt-1 flex items-baseline gap-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-400">From</span>
                <span className="text-lg font-bold text-primary">{draft.isFree ? 'Free' : `₱${minPrice.toLocaleString()}`}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {draft.description && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">About</p>
            <p className="text-xs text-gray-700 whitespace-pre-line line-clamp-6">{draft.description}</p>
          </div>
        )}

        {/* Location detail */}
        {(draft.address || draft.landmark || draft.latitude || draft.longitude) && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Location</p>
            {draft.address && <p className="text-xs text-gray-700">{draft.address}</p>}
            {draft.landmark && <p className="text-xs text-gray-500 italic">📍 {draft.landmark}</p>}
            {(draft.latitude || draft.longitude) && (
              <p className="text-xs text-gray-500 font-mono mt-1">
                {draft.latitude && `Lat: ${draft.latitude}`}
                {draft.latitude && draft.longitude && ' · '}
                {draft.longitude && `Lng: ${draft.longitude}`}
              </p>
            )}
          </div>
        )}

        {/* Schedule full */}
        {(startsAt || endsAt) && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Schedule</p>
            {startsAt && <p className="text-xs text-gray-700"><span className="text-gray-500">Starts:</span> {formatDate(startsAt)}</p>}
            {endsAt && <p className="text-xs text-gray-700"><span className="text-gray-500">Ends:</span> {formatDate(endsAt)}</p>}
          </div>
        )}

        {/* Capacity */}
        {maxCap > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Capacity</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700">{maxCap.toLocaleString()} attendees</span>
              {tiers.length > 0 && (
                <span className={`text-[10px] font-semibold ${totalTier === maxCap ? 'text-green-600' : 'text-amber-600'}`}>
                  Tiers: {totalTier.toLocaleString()} / {maxCap.toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${totalTier === maxCap ? 'bg-green-500' : totalTier > maxCap ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, maxCap > 0 ? (totalTier / maxCap) * 100 : 0)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tiers */}
        {tiers.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Tickets</p>
            <div className="space-y-1.5">
              {tiers.map((t) => (
                <div key={t.key} className="flex items-center justify-between rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{t.name || '(unnamed)'}</p>
                    {t.description && <p className="text-[10px] text-gray-500 truncate">{t.description}</p>}
                  </div>
                  <div className="text-right pl-2">
                    <p className="text-xs font-bold text-primary">{draft.isFree ? 'Free' : `₱${(parseFloat(t.price) || 0).toLocaleString()}`}</p>
                    <p className="text-[10px] text-gray-400">{t.totalQuantity || 0} avail</p>
                    {t.inclusions.length > 0 && <p className="text-[10px] text-emerald-700">{t.inclusions.length} inclusion{t.inclusions.length === 1 ? '' : 's'}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Speaker */}
        {draft.speakerName && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Speaker</p>
            <p className="text-xs text-gray-700">🎤 {draft.speakerName}</p>
          </div>
        )}

        {/* Agenda */}
        {draft.agenda.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Agenda</p>
            <ul className="space-y-1">
              {draft.agenda.slice(0, 4).map((a, i) => (
                <li key={i} className="text-xs text-gray-700 flex gap-2">
                  <span className="text-gray-400 font-mono shrink-0">{a.time}</span>
                  <span className="truncate">{a.title}</span>
                </li>
              ))}
              {draft.agenda.length > 4 && (
                <li className="text-[10px] text-gray-400 italic">+{draft.agenda.length - 4} more…</li>
              )}
            </ul>
          </div>
        )}

        {/* Sponsors */}
        {draft.sponsors.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Sponsors</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.sponsors.map((s, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{s.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* FAQs */}
        {draft.faqs.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">FAQs</p>
            <p className="text-[11px] text-gray-500">{draft.faqs.length} question{draft.faqs.length === 1 ? '' : 's'}</p>
          </div>
        )}
        {draft.customSections.filter((section) => section.isVisible).length > 0 && (
          <div className="border-t border-gray-100 px-4 py-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-400">Event details</p>
            <div className="space-y-1">{draft.customSections.filter((section) => section.isVisible).slice(0, 3).map((section, index) => <p key={`${section.title}-${index}`} className="truncate text-xs font-medium text-gray-700">{section.title}</p>)}</div>
          </div>
        )}

        {/* Empty state */}
        {!draft.title && !draft.description && tiers.length === 0 && (
          <div className="text-center py-6 text-gray-400 text-xs">
            <p>Start filling out the form —</p>
            <p>your event will appear here in real-time. ✨</p>
          </div>
        )}
      </div>
    </aside>
  );
}
