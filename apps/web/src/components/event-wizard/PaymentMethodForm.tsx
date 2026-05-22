'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { LocalPaymentMethod } from './types';

interface PaymentMethodFormProps {
  initial: LocalPaymentMethod;
  onSave: (pm: LocalPaymentMethod) => void;
  onCancel: () => void;
}

export default function PaymentMethodForm({ initial, onSave, onCancel }: PaymentMethodFormProps) {
  const [pm, setPm] = useState<LocalPaymentMethod>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const upd = (field: keyof LocalPaymentMethod, value: string) =>
    setPm((prev) => ({ ...prev, [field]: value }));

  const hasValue = pm.name.trim() || pm.accountName.trim() || pm.accountNumber.trim() || pm.qrFile;
  const isNew = !initial.name && !initial.accountName && !initial.accountNumber;

  function handleQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG files are allowed');
      e.target.value = '';
      return;
    }
    const preview = URL.createObjectURL(file);
    setPm((prev) => ({ ...prev, qrFile: file, qrPreview: preview }));
  }

  const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <p className="font-medium text-sm text-gray-900">{isNew ? 'New Payment Method' : 'Edit Payment Method'}</p>
      <div className="flex gap-3">
        {(['bank', 'ewallet'] as const).map((t) => (
          <button
            key={t} type="button"
            onClick={() => setPm((prev) => ({ ...prev, type: t }))}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              pm.type === t ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
            }`}
          >
            {t === 'bank' ? '🏦 Bank Transfer' : '📱 E-Wallet'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {pm.type === 'bank' ? 'Bank Name' : 'E-Wallet Name'}
          </label>
          <input className={INP}
            placeholder={pm.type === 'bank' ? 'e.g. BPI, BDO' : 'e.g. GCash, Maya'}
            value={pm.name} onChange={(e) => upd('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
          <input className={INP} placeholder="e.g. Juan Dela Cruz"
            value={pm.accountName} onChange={(e) => upd('accountName', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {pm.type === 'bank' ? 'Account Number' : 'Mobile / Account Number'}
          </label>
          <input className={INP}
            placeholder={pm.type === 'bank' ? 'e.g. 1234-5678-90' : 'e.g. 0917-123-4567'}
            value={pm.accountNumber} onChange={(e) => upd('accountNumber', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          QR Code <span className="text-gray-400">(optional · JPG or PNG only)</span>
        </label>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleQrFile} />
        {pm.qrPreview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pm.qrPreview} alt="QR preview" className="h-16 w-16 object-contain rounded border border-gray-200 bg-white" />
            <button type="button"
              onClick={() => { setPm((prev) => ({ ...prev, qrFile: null, qrPreview: '' })); if (fileRef.current) fileRef.current.value = ''; }}
              className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-sm text-primary border border-dashed border-primary/40 rounded-lg px-3 py-2 hover:bg-primary/5 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload QR Code
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!hasValue} onClick={() => onSave(pm)}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40">
          {isNew ? 'Add' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
