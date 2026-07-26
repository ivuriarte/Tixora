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
  /** Service fee override (only provided in edit mode) */
  platformFee?: number | null;
  onSaveFee?: (fee: number) => void;
  feeSaving?: boolean;
  isAdmin?: boolean;
  isFree?: boolean;
}

export default function PaymentStep({ paymentMethods, onAdd, onEdit, onRemove, onReorder, platformFee, onSaveFee, feeSaving, isAdmin, isFree = false }: PaymentStepProps) {
  const [pmKey, setPmKey] = useState(0);
  const [showAdd, setShowAdd] = useState(paymentMethods.length === 0);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [feeInput, setFeeInput] = useState(() =>
    platformFee != null ? String(platformFee) : '50',
  );

  function handleAdd(pm: LocalPaymentMethod) {
    onAdd({ ...pm, key: pmKey });
    setPmKey((k) => k + 1);
    setShowAdd(false);
  }

  const showFeeSection = platformFee != null || isAdmin === true;

  return (
    <>
      <p className="text-sm text-gray-500 -mt-2">
        Optional. Add bank or e-wallet payment methods for manual payments. Skip if you only need automated checkout later.
      </p>

      {/* ── Service Fee ─────────────────────────────────────────────────────── */}
      {showFeeSection && (
        <div className={`rounded-xl border p-4 space-y-3 ${isAdmin ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <svg className={`w-4 h-4 shrink-0 ${isAdmin ? 'text-amber-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className={`text-sm font-semibold ${isAdmin ? 'text-amber-900' : 'text-gray-700'}`}>
              Service Fee
              {isAdmin && <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Admin only</span>}
            </p>
          </div>

          {isAdmin ? (
            <>
              <p className="text-xs text-amber-700">
                {isFree
                  ? 'This event is marked Free. No platform fee will be collected.'
                  : <>One flat processing fee is added to each registration transaction, regardless of the number of attendees. This overrides the platform default (₱50 per transaction). Set to <strong>0</strong> for free events or events without a processing fee.</>}
              </p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-[160px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">₱</span>
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    step="0.01"
                    value={isFree ? '0' : feeInput}
                    disabled={isFree}
                    onChange={(e) => setFeeInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-amber-300 bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={feeSaving || isFree}
                  onClick={() => {
                    const fee = parseFloat(feeInput);
                    if (!isNaN(fee) && fee >= 0 && onSaveFee) onSaveFee(fee);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {feeSaving ? 'Saving…' : 'Save fee'}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                This fee appears as a line item at checkout and is collected on top of the ticket price.{' '}
                <a href="/admin/settings/platform" className="text-violet-600 hover:underline">Edit platform default →</a>
              </p>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500">{isFree ? 'This event is marked Free, so no processing fee is charged.' : 'One flat processing fee is charged per registration transaction, regardless of attendee quantity. This is set by the platform administrator and cannot be changed here.'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold text-gray-800">₱{isFree ? '0' : platformFee != null ? platformFee.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '50'}</p>
                <p className="text-xs text-gray-400">per transaction</p>
              </div>
            </div>
          )}
        </div>
      )}

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
                    // eslint-disable-next-line @next/next/no-img-element -- blob: URL from local file picker; next/image does not support blob: scheme
                    <img src={pm.qrPreview} alt="QR" width={32} height={32} loading="lazy" decoding="async" className="h-8 w-8 object-contain rounded border border-gray-100" />
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
