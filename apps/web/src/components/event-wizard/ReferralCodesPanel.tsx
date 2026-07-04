'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface ReferralDraft {
  key: number;
  name: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  applicableTierIds: string[];
}

interface ExistingReferral extends Omit<ReferralDraft, 'key' | 'discountValue' | 'maxUses' | 'validFrom' | 'validUntil'> {
  id: string; discountValue: number; maxUses: number | null; validFrom: string | null; validUntil: string | null; isActive: boolean; usageCount: number; attendeeCount: number; totalDiscount: number;
}

interface EditDraft { name: string; maxUses: string; validFrom: string; validUntil: string; }

const emptyReferral = (): ReferralDraft => ({ key: Date.now(), name: '', code: '', discountType: 'percentage', discountValue: '', maxUses: '', validFrom: '', validUntil: '', applicableTierIds: [] });

const toLocalDatetime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ReferralCodesPanel({ eventId, tiers, pending = [], onPendingChange }: { eventId?: string; tiers: Array<{ key?: number; serverId?: string; name: string }>; pending?: ReferralDraft[]; onPendingChange?: (codes: ReferralDraft[]) => void }) {
  const [existing, setExisting] = useState<ExistingReferral[]>([]);
  const [draft, setDraft] = useState<ReferralDraft>(emptyReferral());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', maxUses: '', validFrom: '', validUntil: '' });
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const response = await api.get<{ data: ExistingReferral[] }>(`/admin/events/${eventId}/referral-codes`);
    setExisting(response.data.data);
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  async function exportUsage() {
    if (!eventId) return;
    try {
      const response = await api.get(`/admin/events/${eventId}/referral-codes/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'referral-usage.csv'; anchor.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Could not export referral usage.'); }
  }

  function payload(value: ReferralDraft) {
    return { name: value.name.trim(), code: value.code.trim().toUpperCase(), discountType: value.discountType, discountValue: Number(value.discountValue), ...(value.maxUses && { maxUses: Number(value.maxUses) }), ...(value.validFrom && { validFrom: new Date(value.validFrom).toISOString() }), ...(value.validUntil && { validUntil: new Date(value.validUntil).toISOString() }), ...(value.applicableTierIds.length > 0 && { applicableTierIds: value.applicableTierIds }) };
  }

  async function add() {
    if (!draft.name.trim() || !/^[A-Z0-9_-]{3,32}$/i.test(draft.code) || Number(draft.discountValue) <= 0) return;
    if (draft.discountType === 'percentage' && Number(draft.discountValue) > 100) { toast.error('Percentage cannot exceed 100%.'); return; }
    if (!eventId) { onPendingChange?.([...pending, { ...draft, code: draft.code.toUpperCase() }]); setDraft(emptyReferral()); setOpen(false); return; }
    setSaving(true);
    try { await api.post(`/admin/events/${eventId}/referral-codes`, payload(draft)); toast.success('Referral code created.'); await load(); setDraft(emptyReferral()); setOpen(false); }
    catch (error: any) { const message = error?.response?.data?.message ?? 'Could not create referral code.'; toast.error(Array.isArray(message) ? message.join(' ') : message); }
    finally { setSaving(false); }
  }

  async function toggle(code: ExistingReferral) {
    try { await api.patch(`/admin/events/${eventId}/referral-codes/${code.id}/status`, { isActive: !code.isActive }); await load(); toast.success(code.isActive ? 'Referral code deactivated.' : 'Referral code activated.'); } catch { toast.error('Could not update referral status.'); }
  }

  function startEdit(code: ExistingReferral) {
    setConfirmDeleteId(null);
    setEditingId(code.id);
    setEditDraft({
      name: code.name,
      maxUses: code.maxUses != null ? String(code.maxUses) : '',
      validFrom: toLocalDatetime(code.validFrom),
      validUntil: toLocalDatetime(code.validUntil),
    });
  }

  async function saveEdit(codeId: string) {
    if (!editDraft.name.trim()) { toast.error('Name is required.'); return; }
    setEditSaving(true);
    try {
      await api.patch(`/admin/events/${eventId}/referral-codes/${codeId}`, {
        name: editDraft.name.trim(),
        maxUses: editDraft.maxUses ? Number(editDraft.maxUses) : null,
        validFrom: editDraft.validFrom ? new Date(editDraft.validFrom).toISOString() : null,
        validUntil: editDraft.validUntil ? new Date(editDraft.validUntil).toISOString() : null,
      });
      toast.success('Referral code updated.');
      setEditingId(null);
      await load();
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Could not update referral code.';
      toast.error(Array.isArray(message) ? message.join(' ') : message);
    } finally { setEditSaving(false); }
  }

  async function confirmDelete(codeId: string) {
    setDeleteSaving(true);
    try {
      await api.delete(`/admin/events/${eventId}/referral-codes/${codeId}`);
      toast.success('Referral code deleted. Existing attendee discounts are preserved.');
      setConfirmDeleteId(null);
      await load();
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Could not delete referral code.';
      toast.error(Array.isArray(message) ? message.join(' ') : message);
    } finally { setDeleteSaving(false); }
  }

  const rows = eventId ? existing : pending;
  return <section className="mt-6 space-y-4 border-t border-gray-100 pt-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="font-semibold text-gray-900">Referral codes</h3>
        <p className="mt-1 text-xs text-gray-500">Discount value and code string cannot be changed after creation. Name, limits, and validity window are editable.</p>
      </div>
      <button type="button" onClick={() => { setOpen(true); setEditingId(null); setConfirmDeleteId(null); }} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">+ New code</button>
    </div>

    {rows.length === 0 && <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No referral codes configured.</p>}

    {rows.map((item: ReferralDraft | ExistingReferral, index) => {
      const isExisting = 'id' in item;
      const value = Number(item.discountValue);
      const isEditing = isExisting && editingId === item.id;
      const isConfirmingDelete = isExisting && confirmDeleteId === item.id;

      return <div key={isExisting ? item.id : item.key} className="rounded-xl border border-gray-200">
        {/* Row header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2">
              <code className="rounded bg-gray-900 px-2 py-1 text-xs font-bold tracking-wider text-white">{item.code}</code>
              <span className="font-medium text-gray-900">{isEditing ? editDraft.name || item.name : item.name}</span>
              {isExisting && (() => {
                const scheduled = item.isActive && item.validFrom && new Date(item.validFrom) > new Date();
                return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${scheduled ? 'bg-blue-100 text-blue-700' : item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{scheduled ? 'Scheduled' : item.isActive ? 'Active' : 'Inactive'}</span>;
              })()}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {item.discountType === 'percentage' ? `${value}% off` : `₱${value.toLocaleString()} off`} · {item.applicableTierIds.length ? `${item.applicableTierIds.length} selected tier(s)` : 'All tiers'}{isExisting ? ` · ${item.usageCount} uses · ${item.attendeeCount} attendees` : ''}
            </p>
          </div>
          {isExisting ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => toggle(item)} className="text-xs font-semibold text-primary hover:underline">{item.isActive ? 'Deactivate' : 'Activate'}</button>
              <button type="button" onClick={() => { isEditing ? setEditingId(null) : startEdit(item); setConfirmDeleteId(null); }} className="text-xs font-semibold text-gray-600 hover:underline">{isEditing ? 'Cancel edit' : 'Edit'}</button>
              <button type="button" onClick={() => { setConfirmDeleteId(isConfirmingDelete ? null : item.id); setEditingId(null); }} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
            </div>
          ) : (
            <button type="button" onClick={() => onPendingChange?.(pending.filter((_, i) => i !== index))} className="text-xs text-red-600">Remove</button>
          )}
        </div>

        {/* Inline edit form */}
        {isEditing && isExisting && (
          <div className="border-t border-gray-100 bg-gray-50/60 p-4 space-y-3 rounded-b-xl">
            <p className="text-xs text-gray-500">Code, discount type, and discount value cannot be changed. Edit the fields below and save.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-600">Name
                <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} maxLength={80} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-gray-600">Max uses (leave blank for unlimited)
                <input type="number" min="1" value={editDraft.maxUses} onChange={(e) => setEditDraft({ ...editDraft, maxUses: e.target.value })} placeholder="Unlimited" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-600">Valid from
                <input type="datetime-local" value={editDraft.validFrom} onChange={(e) => setEditDraft({ ...editDraft, validFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-gray-600">Valid until
                <input type="datetime-local" value={editDraft.validUntil} onChange={(e) => setEditDraft({ ...editDraft, validUntil: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => saveEdit(item.id)} disabled={editSaving} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editSaving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Inline delete confirmation */}
        {isConfirmingDelete && isExisting && (
          <div className="border-t border-red-100 bg-red-50/60 p-4 rounded-b-xl">
            <p className="text-sm font-medium text-red-800">Delete this referral code?</p>
            <p className="mt-1 text-xs text-red-600">The code will stop working immediately. Attendees who already used it keep their discount.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => confirmDelete(item.id)} disabled={deleteSaving} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleteSaving ? 'Deleting…' : 'Yes, delete'}</button>
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>;
    })}

    {/* New code form */}
    {open && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><input aria-label="Referral name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Campaign name" maxLength={80} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /><input aria-label="Referral code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="CODE2026" maxLength={32} className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase" /></div>
      <div className="grid gap-3 sm:grid-cols-3"><select aria-label="Discount type" value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as ReferralDraft['discountType'] })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount (PHP)</option></select><input aria-label="Discount value" type="number" min="0.01" step="0.01" value={draft.discountValue} onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })} placeholder={draft.discountType === 'percentage' ? '10%' : '500 PHP'} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /><input aria-label="Maximum uses" type="number" min="1" value={draft.maxUses} onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })} placeholder="Max uses (optional)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-gray-600">Valid from<input type="datetime-local" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label><label className="text-xs text-gray-600">Valid until<input type="datetime-local" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label></div>
      <div><p className="mb-2 text-xs font-medium text-gray-600">Applicable tiers (none selected means all)</p><div className="flex flex-wrap gap-2">{tiers.map((tier) => { const tierValue = tier.serverId ?? `local:${tier.key}`; return <label key={tierValue} className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs"><input type="checkbox" checked={draft.applicableTierIds.includes(tierValue)} onChange={(e) => setDraft({ ...draft, applicableTierIds: e.target.checked ? [...draft.applicableTierIds, tierValue] : draft.applicableTierIds.filter((id) => id !== tierValue) })} />{tier.name}</label>; })}</div></div>
      <div className="flex gap-2"><button type="button" onClick={add} disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create code'}</button><button type="button" onClick={() => { setOpen(false); setDraft(emptyReferral()); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button></div>
    </div>}

    {eventId && <button type="button" onClick={exportUsage} className="inline-block text-xs font-medium text-primary hover:underline">Export usage CSV</button>}
  </section>;
}
