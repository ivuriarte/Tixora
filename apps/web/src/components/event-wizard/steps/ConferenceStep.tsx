'use client';

import type { EventDraft } from '../types';
import { SponsorListManager, FaqListManager, AgendaListManager } from '@/components/ConferenceFields';
import CustomSectionsManager from '../CustomSectionsManager';

interface ConferenceStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}

const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export default function ConferenceStep({ draft, update }: ConferenceStepProps) {
  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">Build a flexible event story for conferences, concerts, fun runs, workshops, and more. Everything here is optional.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Speaker Name</label>
        <input
          className={INP}
          placeholder="e.g. John Smith"
          value={draft.speakerName}
          onChange={(e) => update({ speakerName: e.target.value })}
        />
      </div>

      <AgendaListManager agenda={draft.agenda} onChange={(agenda) => update({ agenda })} />
      <SponsorListManager sponsors={draft.sponsors} onChange={(sponsors) => update({ sponsors })} />
      <FaqListManager faqs={draft.faqs} onChange={(faqs) => update({ faqs })} />
      <div className="border-t border-gray-100 pt-5"><CustomSectionsManager sections={draft.customSections} onChange={(customSections) => update({ customSections })} /></div>
    </>
  );
}
