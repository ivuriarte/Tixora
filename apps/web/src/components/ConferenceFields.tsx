'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ImageUploader from './event-wizard/ImageUploader';
import TimeSelect from './event-wizard/TimeSelect';
import ReorderButtons, { moveItem } from './ReorderButtons';

/**
 * Auto-commit hook: if the user typed a valid entry into the "+ Add" panel
 * but navigated away (e.g. clicked Next in the wizard) without clicking the
 * explicit Add button, flush the in-progress draft on unmount so the data
 * isn't silently lost.
 */
function useFlushPendingDraft<T>(args: {
  showAdd: boolean;
  draft: T;
  items: T[];
  isValid: (d: T) => boolean;
  clean: (d: T) => T;
  onChange: (items: T[]) => void;
}) {
  const ref = useRef(args);
  ref.current = args;
  useEffect(() => {
    return () => {
      const { showAdd, draft, items, isValid, clean, onChange } = ref.current;
      if (showAdd && isValid(draft)) {
        onChange([...items, clean(draft)]);
      }
    };
  }, []);
}

// ── Time format helpers (agenda stores "h:MM AM/PM"; TimeSelect uses "HH:MM") ──

function displayTimeTo24h(display: string): string {
  if (!display) return '';
  const m = display.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === 'AM') h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function time24hToDisplay(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h24 = parseInt(hStr, 10);
  const min = parseInt(mStr, 10);
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SponsorItem {
  name: string;
  logoUrl: string;
  tier: string;
  websiteUrl: string;
  description: string;
  isVisible: boolean;
}

export interface FaqItem {
  question: string;
  answer: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SPONSOR_TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Partner', 'Media Partner', 'Community Partner'];

// ── Sponsor form ───────────────────────────────────────────────────────────────

function SponsorForm({
  value,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  value: SponsorItem;
  onChange: (v: SponsorItem) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Globe Business"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sponsor Tier</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            value={value.tier}
            onChange={(e) => onChange({ ...value, tier: e.target.value })}
          >
            <option value="">— None —</option>
            {SPONSOR_TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Website / Social Link <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="url"
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. https://globebusiness.com"
          value={value.websiteUrl}
          onChange={(e) => onChange({ ...value, websiteUrl: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Logo <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <ImageUploader
          value={value.logoUrl}
          onChange={(url) => onChange({ ...value, logoUrl: url })}
          endpoint="/upload/sponsor-logo"
          accept="image/jpeg,image/png,image/webp"
          maxSizeMB={2}
          hint="Square works best"
          previewAspect="aspect-square"
          variant="logo"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Short description <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea rows={2} maxLength={500} value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" placeholder="What this sponsor contributes" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={value.isVisible} onChange={(e) => onChange({ ...value, isVisible: e.target.checked })} className="rounded border-gray-300 text-primary focus:ring-primary" />Show this sponsor publicly</label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!value.name.trim()}
          onClick={onSave}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Sponsor list manager ───────────────────────────────────────────────────────

export function SponsorListManager({
  sponsors,
  onChange,
}: {
  sponsors: SponsorItem[];
  onChange: (sponsors: SponsorItem[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<SponsorItem>({ name: '', logoUrl: '', tier: '', websiteUrl: '', description: '', isVisible: true });

  useFlushPendingDraft<SponsorItem>({
    showAdd,
    draft,
    items: sponsors,
    isValid: (d) => d.name.trim().length > 0,
    clean: (d) => ({ ...d, name: d.name.trim() }),
    onChange,
  });

  function startEdit(idx: number) {
    setDraft({ ...sponsors[idx] });
    setEditingIdx(idx);
    setShowAdd(false);
  }

  function saveEdit() {
    if (!draft.name.trim() || editingIdx === null) return;
    onChange(sponsors.map((s, i) => (i === editingIdx ? { ...draft, name: draft.name.trim() } : s)));
    setEditingIdx(null);
  }

  function addSponsor() {
    if (!draft.name.trim()) return;
    onChange([...sponsors, { ...draft, name: draft.name.trim() }]);
    setDraft({ name: '', logoUrl: '', tier: '', websiteUrl: '', description: '', isVisible: true });
    // keep panel open so user can immediately add another
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="block text-sm font-medium text-gray-700">Sponsors</span>
        {!showAdd && editingIdx === null && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setDraft({ name: '', logoUrl: '', tier: '', websiteUrl: '', description: '', isVisible: true }); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            + Add Sponsor
          </button>
        )}
      </div>

      {sponsors.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 py-1">No sponsors yet.</p>
      )}

      <div className="space-y-2">
        {sponsors.map((s, idx) =>
          editingIdx === idx ? (
            <SponsorForm
              key={idx}
              value={draft}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={() => setEditingIdx(null)}
              saveLabel="Save"
            />
          ) : (
            <div key={idx} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <ReorderButtons
                  index={idx}
                  total={sponsors.length}
                  onMove={(from, to) => onChange(moveItem(sponsors, from, to))}
                />
                {s.logoUrl && (
                  <Image
                    src={s.logoUrl}
                    alt={s.name}
                    width={32}
                    height={32}
                    className="object-contain rounded flex-shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  {s.logoUrl && (
                    <p className="text-xs text-gray-400 truncate">{s.logoUrl}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                {s.tier && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                    {s.tier}
                  </span>
                )}
                {!s.isVisible && <span className="text-xs text-gray-400">Hidden</span>}
                <button type="button" onClick={() => startEdit(idx)} className="text-primary hover:underline text-xs">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onChange(sponsors.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {showAdd && (
        <SponsorForm
          value={draft}
          onChange={setDraft}
          onSave={addSponsor}
          onCancel={() => setShowAdd(false)}
          saveLabel="Add Sponsor"
        />
      )}
    </div>
  );
}

// ── FAQ form ───────────────────────────────────────────────────────────────────

function FaqForm({
  value,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  value: FaqItem;
  onChange: (v: FaqItem) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Question <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. What is included in the ticket price?"
          value={value.question}
          onChange={(e) => onChange({ ...value, question: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Answer <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="e.g. Full day access with lunch and all materials included."
          value={value.answer}
          onChange={(e) => onChange({ ...value, answer: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!value.question.trim() || !value.answer.trim()}
          onClick={onSave}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── FAQ list manager ───────────────────────────────────────────────────────────

export function FaqListManager({
  faqs,
  onChange,
}: {
  faqs: FaqItem[];
  onChange: (faqs: FaqItem[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<FaqItem>({ question: '', answer: '' });

  useFlushPendingDraft<FaqItem>({
    showAdd,
    draft,
    items: faqs,
    isValid: (d) => d.question.trim().length > 0 && d.answer.trim().length > 0,
    clean: (d) => ({ question: d.question.trim(), answer: d.answer.trim() }),
    onChange,
  });

  function startEdit(idx: number) {
    setDraft({ ...faqs[idx] });
    setEditingIdx(idx);
    setShowAdd(false);
  }

  function saveEdit() {
    if (!draft.question.trim() || !draft.answer.trim() || editingIdx === null) return;
    onChange(faqs.map((f, i) => (i === editingIdx ? { ...draft } : f)));
    setEditingIdx(null);
  }

  function addFaq() {
    if (!draft.question.trim() || !draft.answer.trim()) return;
    onChange([...faqs, { ...draft }]);
    setDraft({ question: '', answer: '' });
    // keep panel open so user can immediately add another
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="block text-sm font-medium text-gray-700">FAQs</span>
        {!showAdd && editingIdx === null && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setDraft({ question: '', answer: '' }); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            + Add FAQ
          </button>
        )}
      </div>

      {faqs.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 py-1">No FAQs yet.</p>
      )}

      <div className="space-y-2">
        {faqs.map((f, idx) =>
          editingIdx === idx ? (
            <FaqForm
              key={idx}
              value={draft}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={() => setEditingIdx(null)}
              saveLabel="Save"
            />
          ) : (
            <div key={idx} className="border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <ReorderButtons
                  index={idx}
                  total={faqs.length}
                  onMove={(from, to) => onChange(moveItem(faqs, from, to))}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{f.question}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{f.answer}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button type="button" onClick={() => startEdit(idx)} className="text-primary hover:underline text-xs">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(faqs.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {showAdd && (
        <FaqForm
          value={draft}
          onChange={setDraft}
          onSave={addFaq}
          onCancel={() => setShowAdd(false)}
          saveLabel="Add FAQ"
        />
      )}
    </div>
  );
}

// ── Agenda ─────────────────────────────────────────────────────────────────────

export interface AgendaItem {
  time: string;
  title: string;
  description?: string;
}

function AgendaForm({
  value,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  value: AgendaItem;
  onChange: (v: AgendaItem) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Time <span className="text-red-500">*</span>
          </label>
          <TimeSelect
            value={displayTimeTo24h(value.time)}
            onChange={(v) => onChange({ ...value, time: time24hToDisplay(v) })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Opening keynote"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Description <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="Brief session description"
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!value.time.trim() || !value.title.trim()}
          onClick={onSave}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AgendaListManager({
  agenda,
  onChange,
}: {
  agenda: AgendaItem[];
  onChange: (agenda: AgendaItem[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<AgendaItem>({ time: '', title: '', description: '' });

  useFlushPendingDraft<AgendaItem>({
    showAdd,
    draft,
    items: agenda,
    isValid: (d) => d.time.trim().length > 0 && d.title.trim().length > 0,
    clean: (d) => ({
      time: d.time.trim(),
      title: d.title.trim(),
      ...(d.description?.trim() ? { description: d.description.trim() } : {}),
    }),
    onChange,
  });

  function startEdit(idx: number) {
    setDraft({ ...agenda[idx], description: agenda[idx].description ?? '' });
    setEditingIdx(idx);
    setShowAdd(false);
  }

  function saveEdit() {
    if (!draft.time.trim() || !draft.title.trim() || editingIdx === null) return;
    const cleaned: AgendaItem = {
      time: draft.time.trim(),
      title: draft.title.trim(),
      ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    };
    onChange(agenda.map((a, i) => (i === editingIdx ? cleaned : a)));
    setEditingIdx(null);
  }

  function addItem() {
    if (!draft.time.trim() || !draft.title.trim()) return;
    const cleaned: AgendaItem = {
      time: draft.time.trim(),
      title: draft.title.trim(),
      ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    };
    onChange([...agenda, cleaned]);
    setDraft({ time: '', title: '', description: '' });
    // keep panel open so user can immediately add another
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="block text-sm font-medium text-gray-700">Program / Agenda</span>
        {!showAdd && editingIdx === null && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setDraft({ time: '', title: '', description: '' }); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            + Add Agenda Item
          </button>
        )}
      </div>

      {agenda.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 py-1">No agenda items yet.</p>
      )}

      <div className="space-y-2">
        {agenda.map((a, idx) =>
          editingIdx === idx ? (
            <AgendaForm
              key={idx}
              value={draft}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={() => setEditingIdx(null)}
              saveLabel="Save"
            />
          ) : (
            <div key={idx} className="flex items-start justify-between border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex gap-3 min-w-0 flex-1">
                <ReorderButtons
                  index={idx}
                  total={agenda.length}
                  onMove={(from, to) => onChange(moveItem(agenda, from, to))}
                  className="mt-0.5"
                />
                <div className="text-primary font-bold text-sm whitespace-nowrap min-w-[80px]">{a.time}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{a.title}</p>
                  {a.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <button type="button" onClick={() => startEdit(idx)} className="text-primary hover:underline text-xs">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onChange(agenda.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {showAdd && (
        <AgendaForm
          value={draft}
          onChange={setDraft}
          onSave={addItem}
          onCancel={() => setShowAdd(false)}
          saveLabel="Add Agenda Item"
        />
      )}
    </div>
  );
}
