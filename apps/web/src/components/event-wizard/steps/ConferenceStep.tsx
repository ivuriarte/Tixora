'use client';

import type { EventDraft } from '../types';
import { SponsorListManager, FaqListManager, AgendaListManager } from '@/components/ConferenceFields';
import CustomSectionsManager from '../CustomSectionsManager';
import RunningConfigEditor from '../RunningConfigEditor';

interface ConferenceStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}

export default function ConferenceStep({ draft, update }: ConferenceStepProps) {
  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">Build a flexible event story for conferences, concerts, fun runs, workshops, and more. Everything here is optional.</p>

      {draft.eventType === 'running' && <RunningConfigEditor draft={draft} update={update} />}

      <CustomSectionsManager sections={draft.customSections} onChange={(customSections) => update({ customSections })} />

      <AgendaListManager agenda={draft.agenda} onChange={(agenda) => update({ agenda })} />
      <SponsorListManager sponsors={draft.sponsors} onChange={(sponsors) => update({ sponsors })} />
      <FaqListManager faqs={draft.faqs} onChange={(faqs) => update({ faqs })} />
    </>
  );
}
