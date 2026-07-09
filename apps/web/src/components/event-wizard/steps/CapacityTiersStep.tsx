'use client';

import { useState } from 'react';
import type { EventDraft, LocalTier } from '../types';
import { emptyTier } from '../types';
import TierForm from '../TierForm';
import ReorderButtons, { moveItem } from '@/components/ReorderButtons';

interface CapacityTiersStepProps {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  tiers: LocalTier[];
  /** Add a fresh tier to the list. Returns optional new key (caller may ignore). */
  onAddTier: (t: LocalTier) => void;
  /** Edit an existing tier in-place. */
  onEditTier: (t: LocalTier) => void;
  /** Remove a tier from the list. */
  onRemoveTier: (key: number) => void;
  /** Persist a reordered tier list (optional; reorder UI hidden when omitted). */
  onReorderTiers?: (next: LocalTier[]) => void;
}

const REQ = <span className="text-red-500 ml-0.5">*</span>;
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export default function CapacityTiersStep({
  draft,
  update,
  tiers,
  onAddTier,
  onEditTier,
  onRemoveTier,
  onReorderTiers,
}: CapacityTiersStepProps) {
  const [tierKey, setTierKey] = useState(0);
  const [showAdd, setShowAdd] = useState(true);
  const [editingKey, setEditingKey] = useState<number | null>(null);

  const tiersTotal = tiers.reduce((s, t) => s + (parseInt(t.totalQuantity, 10) || 0), 0);
  const capacityNum = parseInt(draft.maxCapacity, 10) || 0;
  const matches = capacityNum > 0 && tiers.length > 0 && tiersTotal === capacityNum;
  const diff = tiersTotal - capacityNum;

  function handleAdd(t: LocalTier) {
    onAddTier({ ...t, key: tierKey, price: draft.isFree ? '0' : t.price });
    setTierKey((k) => k + 1);
    // Keep the panel open with a fresh blank tier
    setShowAdd(true);
  }

  function toggleFreeEvent(checked: boolean) {
    update({ isFree: checked, platformFee: checked ? '0' : draft.platformFee });
    if (checked && onReorderTiers) {
      onReorderTiers(tiers.map((tier) => ({ ...tier, price: '0' })));
    }
  }

  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Set the maximum number of attendees, then add ticket tiers. The total quantity across all tiers must equal the maximum capacity.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Capacity{REQ}</label>
        <input
          type="number" min="1" className={INP} placeholder="e.g. 500"
          value={draft.maxCapacity}
          onChange={(e) => update({ maxCapacity: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">
          Total attendees allowed. Event auto-switches to sold-out when reached.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.isFree}
          onChange={(e) => toggleFreeEvent(e.target.checked)}
          className="mt-1 accent-emerald-600"
        />
        <span>
          <span className="block text-sm font-semibold text-emerald-950">Free event</span>
          <span className="block text-xs leading-relaxed text-emerald-700">
            Ticket tiers are tagged Free, tier prices are set to ₱0, and no platform fee is added during registration.
          </span>
        </span>
      </label>

      {/* Capacity / tier total live bar */}
      {capacityNum > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Tier total: <span className="font-semibold text-gray-900">{tiersTotal.toLocaleString()}</span> / {capacityNum.toLocaleString()}</span>
            <span className={`text-xs font-semibold ${matches ? 'text-green-600' : diff > 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {matches ? '✓ Matches capacity' : diff > 0 ? `+${diff.toLocaleString()} over` : `${diff.toLocaleString()} remaining`}
            </span>
          </div>
          <div className="mt-1.5 h-2 bg-white border border-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${matches ? 'bg-green-500' : diff > 0 ? 'bg-red-500' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, capacityNum > 0 ? (tiersTotal / capacityNum) * 100 : 0)}%` }}
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-sm">Ticket Tiers{REQ}</h3>
          {!showAdd && editingKey === null && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-sm text-primary hover:underline font-medium"
            >
              + Add Tier
            </button>
          )}
        </div>

        {tiers.length > 0 && (
          <div className="space-y-2 mb-3">
            {tiers.map((tier, idx) =>
              editingKey === tier.key ? (
                <TierForm
                  key={tier.key}
                  initial={tier}
                  isFree={draft.isFree}
                  onSave={(updated) => {
                    onEditTier(draft.isFree ? { ...updated, price: '0' } : updated);
                    setEditingKey(null);
                  }}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <div key={tier.key} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    {onReorderTiers && (
                      <ReorderButtons
                        index={idx}
                        total={tiers.length}
                        onMove={(from, to) => onReorderTiers(moveItem(tiers, from, to))}
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{tier.name}</p>
                      <p className="text-xs text-gray-500">
                        {draft.isFree ? 'Free' : `₱${parseFloat(tier.price || '0').toLocaleString()}`} · {tier.totalQuantity} total · max {tier.maxPerOrder}/order
                        {tier.inclusions.length > 0 ? ` · ${tier.inclusions.length} inclusion${tier.inclusions.length === 1 ? '' : 's'}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tier.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tier.isVisible ? 'visible' : 'hidden'}
                    </span>
                    <button type="button" onClick={() => setEditingKey(tier.key)} className="text-primary hover:underline text-xs">Edit</button>
                    <button type="button" onClick={() => onRemoveTier(tier.key)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {showAdd && editingKey === null && (
          <TierForm
            key={tierKey}
            initial={emptyTier(tierKey)}
            isFree={draft.isFree}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {tiers.length === 0 && !showAdd && (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">
            No tiers yet. Click <strong>+ Add Tier</strong> to create your first one.
          </p>
        )}
      </div>
    </>
  );
}
