'use client';

import type { EventDraft } from '../types';
import ImageUploader from '../ImageUploader';

interface BasicsStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}

const REQ = <span className="text-red-500 ml-0.5">*</span>;
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export default function BasicsStep({ draft, update }: BasicsStepProps) {
  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Start with the essentials. Give your event a clear title and a description that helps attendees decide to join.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title{REQ}</label>
        <input
          className={INP}
          placeholder="e.g. My Awesome Concert 2026"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description{REQ}</label>
        <textarea
          rows={5}
          className={`${INP} resize-none`}
          placeholder="Describe your event for attendees…"
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">{draft.description.length} characters</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Category{REQ}</span>
          <select className={INP} value={draft.category} onChange={(event) => update({ category: event.target.value as EventDraft['category'] })}>
            <option value="sports">Sports</option>
            <option value="business">Business</option>
            <option value="workshops">Workshops</option>
            <option value="music">Music</option>
            <option value="theater">Theater</option>
            <option value="parties">Parties</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Event format{REQ}</span>
          <select className={INP} value={draft.eventType} onChange={(event) => update({ eventType: event.target.value as EventDraft['eventType'] })}>
            <option value="standard">Standard event</option>
            <option value="running">Running event / fun run</option>
          </select>
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <input type="checkbox" checked={draft.isOnline} onChange={(event) => update({ isOnline: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <span>
          <span className="block text-sm font-semibold text-gray-900">Online event</span>
          <span className="mt-0.5 block text-xs leading-5 text-gray-500">Adds the Online label automatically. Keep the joining instructions in the event details.</span>
        </span>
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cover Image{REQ}
        </label>
        <ImageUploader
          value={draft.imageUrl}
          onChange={(url) => update({ imageUrl: url })}
          endpoint="/upload/event-cover"
          accept="image/jpeg,image/png,image/webp"
          maxSizeMB={5}
          hint="Required · JPG, PNG, or WebP · recommended 1200×630"
          previewAspect="aspect-[1200/630]"
        />
      </div>
    </>
  );
}
