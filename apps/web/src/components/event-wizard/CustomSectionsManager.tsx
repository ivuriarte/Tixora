'use client';

import { useState } from 'react';
import ImageUploader from './ImageUploader';
import ReorderButtons, { moveItem } from '@/components/ReorderButtons';
import type { CustomSectionItem } from './types';

const emptySection = (): CustomSectionItem => ({ title: '', description: '', imageUrl: '', imageAlt: '', isVisible: true });

export default function CustomSectionsManager({ sections, onChange }: { sections: CustomSectionItem[]; onChange: (sections: CustomSectionItem[]) => void }) {
  const [draft, setDraft] = useState<CustomSectionItem>(emptySection());
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const imageAltIsInvalid = Boolean(draft.imageUrl.trim() && draft.imageAlt.trim().length < 3);

  function save() {
    if (!draft.title.trim() || !draft.description.trim() || imageAltIsInvalid) return;
    const cleaned = { ...draft, title: draft.title.trim(), description: draft.description.trim(), imageAlt: draft.imageAlt.trim() };
    onChange(editing === null ? [...sections, cleaned] : sections.map((section, index) => index === editing ? cleaned : section));
    setDraft(emptySection()); setEditing(null); setAdding(false);
  }

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-gray-700">Custom detail blocks</p><p className="text-xs text-gray-400">Add information unique to this event type.</p></div>{!adding && editing === null && <button type="button" onClick={() => setAdding(true)} className="shrink-0 text-xs font-semibold text-primary hover:underline">+ Add detail block</button>}</div>
    {sections.map((section, index) => <div key={`${section.title}-${index}`} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
      <ReorderButtons index={index} total={sections.length} onMove={(from, to) => onChange(moveItem(sections, from, to))} />
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-gray-900">{section.title}</p>{!section.isVisible && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">Hidden</span>}</div><p className="mt-1 line-clamp-2 text-xs text-gray-500">{section.description}</p></div>
      <button type="button" onClick={() => { setDraft(section); setEditing(index); setAdding(false); }} className="text-xs text-primary">Edit</button><button type="button" onClick={() => onChange(sections.filter((_, i) => i !== index))} className="text-xs text-red-600">Remove</button>
    </div>)}
    {(adding || editing !== null) && <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <input aria-label="Detail block title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} placeholder="Title, e.g. Race Kit Collection" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <textarea aria-label="Detail block description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={5000} rows={4} placeholder="Describe this part of the event" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <ImageUploader value={draft.imageUrl} onChange={(imageUrl) => setDraft({ ...draft, imageUrl, ...(!imageUrl && { imageAlt: '' }) })} endpoint="/upload/event-cover" accept="image/jpeg,image/png,image/webp" maxSizeMB={5} hint="Optional image · JPG, PNG, or WebP · up to 5 MB" previewAspect="aspect-video" />
      {draft.imageUrl && <label className="block space-y-1">
        <span className="text-xs font-semibold text-gray-600">Image description <span className="text-red-500">*</span> <span className="font-normal text-gray-400">(required for accessibility)</span></span>
        <input aria-label="Image description" value={draft.imageAlt} onChange={(e) => setDraft({ ...draft, imageAlt: e.target.value })} minLength={3} maxLength={200} placeholder="Describe what is shown in the image" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
        {imageAltIsInvalid && <p className="text-xs text-red-600">Enter at least 3 characters.</p>}
      </label>}
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isVisible} onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })} />Visible on public event page</label>
      <div className="flex gap-2"><button type="button" disabled={!draft.title.trim() || !draft.description.trim() || imageAltIsInvalid} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{editing === null ? 'Add block' : 'Save block'}</button><button type="button" onClick={() => { setDraft(emptySection()); setAdding(false); setEditing(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button></div>
    </div>}
  </div>;
}
