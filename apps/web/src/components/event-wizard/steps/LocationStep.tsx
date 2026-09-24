'use client';

import type { EventDraft } from '../types';
import { DEFAULT_EVENT_HOURS, addHoursToParts, combineDatetime, isEndTimeRequired, todayStr } from '../types';
import TimeSelect from '../TimeSelect';

interface LocationStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}

const REQ = <span className="text-red-500 ml-0.5">*</span>;
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export default function LocationStep({ draft, update }: LocationStepProps) {
  const startsAt = combineDatetime(draft.startDate, draft.startTime);
  const endsAt = combineDatetime(draft.endDate, draft.endTime);
  const endBeforeStart = !!startsAt && !!endsAt && new Date(endsAt) <= new Date(startsAt);
  const endRequired = isEndTimeRequired(draft);

  // Pre-fill the end from the start, and keep it following the start until the organizer edits it.
  const updateStart = (patch: { startDate?: string; startTime?: string }) => {
    const next = { startDate: draft.startDate, startTime: draft.startTime, ...patch };
    const prevDefault = addHoursToParts(draft.startDate, draft.startTime, DEFAULT_EVENT_HOURS);
    const endUntouched =
      (!draft.endDate && !draft.endTime) ||
      (draft.endDate === prevDefault.date && draft.endTime === prevDefault.time);
    const nextDefault = addHoursToParts(next.startDate, next.startTime, DEFAULT_EVENT_HOURS);
    if (endRequired && endUntouched && nextDefault.date) {
      update({ ...patch, endDate: nextDefault.date, endTime: nextDefault.time });
    } else {
      update(patch);
    }
  };

  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Where and when will your event happen? Past dates are disabled.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Venue{REQ}</label>
          <input
            className={INP} placeholder="e.g. SMX Convention Center"
            value={draft.venue} onChange={(e) => update({ venue: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City{REQ}</label>
          <input
            className={INP} placeholder="e.g. Davao City"
            value={draft.city} onChange={(e) => update({ city: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address{REQ}</label>
        <input
          className={INP} placeholder="e.g. JP Laurel Ave, Davao City 8000"
          value={draft.address} onChange={(e) => update({ address: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Landmark <span className="text-gray-400 font-normal text-xs">(optional)</span>
        </label>
        <input
          className={INP} placeholder="e.g. Near SM Lanang Premier, beside BDO"
          value={draft.landmark} onChange={(e) => update({ landmark: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Latitude <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <input
            type="number" step="0.0000001"
            className={INP} placeholder="e.g. 7.0644"
            value={draft.latitude} onChange={(e) => update({ latitude: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Right-click on Google Maps → Copy coordinates</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Longitude <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <input
            type="number" step="0.0000001"
            className={INP} placeholder="e.g. 125.6078"
            value={draft.longitude} onChange={(e) => update({ longitude: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Exact map pin (skips geocoding)</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Starts At{REQ}</label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date" min={todayStr()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={draft.startDate} onChange={(e) => updateStart({ startDate: e.target.value })}
          />
          <TimeSelect value={draft.startTime} onChange={(v) => updateStart({ startTime: v })} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Ends At{endRequired ? REQ : <span className="text-gray-400 font-normal"> (optional)</span>}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date" min={draft.startDate || todayStr()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={draft.endDate} onChange={(e) => update({ endDate: e.target.value })}
          />
          <TimeSelect value={draft.endTime} onChange={(v) => update({ endTime: v })} />
        </div>
        {!endRequired && !endsAt && (
          <p className="text-xs text-gray-500 mt-1">
            No end time set — this event will be marked completed 24 hours after it starts.
          </p>
        )}
        {endBeforeStart && (
          <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            End date/time must be after the start date/time.
          </div>
        )}
      </div>
    </>
  );
}
