'use client';

import type { EventDraft } from '../types';

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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cover Image URL <span className="text-gray-400 font-normal text-xs">(optional)</span>
        </label>
        <input
          type="url"
          className={INP}
          placeholder="https://example.com/cover.jpg"
          value={draft.imageUrl}
          onChange={(e) => update({ imageUrl: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">Paste a link to a cover image. Recommended size: 1200×630px.</p>
      </div>
    </>
  );
}
