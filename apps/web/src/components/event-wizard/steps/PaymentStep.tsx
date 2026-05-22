'use client';

import { useState } from 'react';
import type { LocalPaymentMethod } from '../types';
import { emptyPM } from '../types';
import PaymentMethodForm from '../PaymentMethodForm';
import ReorderButtons, { moveItem } from '@/components/ReorderButtons';

interface PaymentStepProps {
  paymentMethods: LocalPaymentMethod[];
  onAdd: (pm: LocalPaymentMethod) => void;
  onEdit: (pm: LocalPaymentMethod) => void;
  onRemove: (key: number) => void;
  /** Persist a reordered array (optional; if omitted, reorder controls are hidden). */
  onReorder?: (next: LocalPaymentMethod[]) => void;
}

export default function PaymentStep({ paymentMethods, onAdd, onEdit, onRemove, onReorder }: PaymentStepProps) {
  const [pmKey, setPmKey] = useState(0);
  const [showAdd, setShowAdd] = useState(paymentMethods.length === 0);
  const [editingKey, setEditingKey] = useState<number | null>(null);

  function handleAdd(pm: LocalPaymentMethod) {
    onAdd({ ...pm, key: pmKey });
    setPmKey((k) => k + 1);
    setShowAdd(true);
  }

  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Optional. Add bank or e-wallet payment methods for manual payments. Skip if you only need automated checkout later.
      </p>

      {paymentMethods.length > 0 && (
        <div className="space-y-2">
          {paymentMethods.map((pm, idx) =>
            editingKey === pm.key ? (
              <PaymentMethodForm
                key={pm.key}
                initial={pm}
                onSave={(updated) => {
                  onEdit(updated);
                  setEditingKey(null);
                }}
                onCancel={() => setEditingKey(null)}
              />
            ) : (
              <div key={pm.key} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {onReorder && (
                    <ReorderButtons
                      index={idx}
                      total={paymentMethods.length}
                      onMove={(from, to) => onReorder(moveItem(paymentMethods, from, to))}
                    />
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    pm.type === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {pm.type === 'bank' ? 'Bank' : 'E-Wallet'}
                  </span>
                  <div>
                    <p className="font-medium text-sm text-gray-800">{pm.name || '(no name)'}</p>
                    {pm.accountNumber && <p className="text-xs text-gray-500">{pm.accountNumber}</p>}
                  </div>
                  {pm.qrPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pm.qrPreview} alt="QR" className="h-8 w-8 object-contain rounded border border-gray-100" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEditingKey(pm.key)} className="text-primary hover:underline text-xs">Edit</button>
                  <button type="button" onClick={() => onRemove(pm.key)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {showAdd && editingKey === null && (
        <PaymentMethodForm
          key={pmKey}
          initial={emptyPM(pmKey)}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {!showAdd && editingKey === null && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="text-sm text-primary hover:underline font-medium"
        >
          + Add Payment Method
        </button>
      )}
    </>
  );
}
