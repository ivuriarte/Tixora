'use client';

import { useState } from 'react';
import type { LocalTier } from './types';

interface TierFormProps {
  initial: LocalTier;
  onSave: (t: LocalTier) => void;
  onCancel: () => void;
  isFree?: boolean;
}

export default function TierForm({ initial, onSave, onCancel, isFree = false }: TierFormProps) {
  const [t, setT] = useState<LocalTier>(() => (isFree ? { ...initial, price: '0' } : initial));
  const [inclusionInput, setInclusionInput] = useState('');
  const upd = (field: keyof LocalTier, value: string | boolean) =>
    setT((prev) => ({ ...prev, [field]: value }));
  const isValid =
    t.name.trim() &&
    (isFree || t.price !== '') &&
    !isNaN(parseFloat(t.price)) &&
    parseFloat(t.price) >= 0 &&
    parseInt(t.totalQuantity, 10) > 0 &&
    parseInt(t.maxPerOrder, 10) > 0;

  function addInclusion() {
    const label = inclusionInput.trim();
    if (!label) return;
    setT((prev) => {
      const exists = prev.inclusions.some((item) => item.label.toLowerCase() === label.toLowerCase());
      if (exists) return prev;
      return {
        ...prev,
        inclusions: [
          ...prev.inclusions,
          { label, stubEnabled: true, sortOrder: prev.inclusions.length },
        ],
      };
    });
    setInclusionInput('');
  }

  function removeInclusion(label: string) {
    setT((prev) => ({
      ...prev,
      inclusions: prev.inclusions
        .filter((item) => item.label !== label)
        .map((item, index) => ({ ...item, sortOrder: index })),
    }));
  }

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <p className="font-medium text-sm text-gray-900">{initial.name ? 'Edit Tier' : 'New Tier'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
          <input
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. General Admission"
            value={t.name}
            onChange={(e) => upd('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Price (₱) <span className="text-red-500">*</span></label>
          <input
            type="number" min={0} step="0.01"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={isFree ? 'Free' : 'e.g. 500'}
            value={isFree ? '0' : t.price}
            disabled={isFree}
            onChange={(e) => upd('price', e.target.value)}
          />
          {isFree && <p className="mt-1 text-xs text-emerald-700">Free event: no ticket amount is collected.</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total Quantity <span className="text-red-500">*</span></label>
          <input
            type="number" min={1}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 100"
            value={t.totalQuantity}
            onChange={(e) => upd('totalQuantity', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order <span className="text-red-500">*</span></label>
          <input
            type="number" min={1} max={20}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 4"
            value={t.maxPerOrder}
            onChange={(e) => upd('maxPerOrder', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. Includes lunch and materials"
          value={t.description}
          onChange={(e) => upd('description', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Inclusions (optional)</label>
        {t.inclusions.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {t.inclusions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => removeInclusion(item.label)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 focus:outline-none focus:ring-2 focus:ring-primary"
                title={`Remove ${item.label}`}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">x</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Meal stub"
            value={inclusionInput}
            maxLength={80}
            onChange={(e) => setInclusionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addInclusion();
              }
            }}
          />
          <button
            type="button"
            onClick={addInclusion}
            className="shrink-0 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-white"
          >
            Add
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox" checked={t.isVisible}
          onChange={(e) => upd('isVisible', e.target.checked)}
          className="accent-primary"
        />
        Visible on event page
      </label>
      <div className="flex gap-2">
        <button
          type="button" disabled={!isValid}
          onClick={() => onSave(isFree ? { ...t, price: '0' } : t)}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40"
        >
          {initial.name ? 'Save Changes' : 'Add Tier'}
        </button>
        <button
          type="button" onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
