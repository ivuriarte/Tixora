'use client';

import { useState } from 'react';
import type { LocalTier } from './types';

interface TierFormProps {
  initial: LocalTier;
  onSave: (t: LocalTier) => void;
  onCancel: () => void;
}

export default function TierForm({ initial, onSave, onCancel }: TierFormProps) {
  const [t, setT] = useState<LocalTier>(initial);
  const upd = (field: keyof LocalTier, value: string | boolean) =>
    setT((prev) => ({ ...prev, [field]: value }));
  const isValid =
    t.name.trim() &&
    t.price !== '' &&
    !isNaN(parseFloat(t.price)) &&
    parseFloat(t.price) >= 0 &&
    parseInt(t.totalQuantity, 10) > 0 &&
    parseInt(t.maxPerOrder, 10) > 0;

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
            placeholder="e.g. 500"
            value={t.price}
            onChange={(e) => upd('price', e.target.value)}
          />
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
          onClick={() => onSave(t)}
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
