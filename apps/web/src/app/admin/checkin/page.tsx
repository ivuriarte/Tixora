'use client';

import { useState, useRef } from 'react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Button from '@/components/Button';

interface CheckinResult {
  valid: boolean;
  attendeeName: string;
  tierName: string;
  eventTitle: string;
  checkedInAt: string;
}

export default function AdminCheckinPage() {
  const [qrToken, setQrToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCheckin(token?: string) {
    const t = token ?? qrToken.trim();
    if (!t) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<{ data: CheckinResult }>('/admin/checkin', { qrToken: t });
      setResult(res.data.data);
      toast.success(`✅ ${res.data.data.attendeeName} checked in!`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Invalid ticket';
      toast.error(msg);
    } finally {
      setLoading(false);
      setQrToken('');
      inputRef.current?.focus();
    }
  }

  // Auto-submit when QR scanner pastes a full token (ends with newline)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQrToken(val);
    if (val.includes('\n') || val.length > 100) {
      handleCheckin(val.trim());
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Check-In Scanner</h1>
        <p className="text-sm text-gray-500">
          Scan a QR code with a barcode scanner, or paste the token below.
        </p>

        <div className="bg-white shadow rounded-2xl p-6 space-y-4">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={qrToken}
            onChange={handleChange}
            placeholder="QR token (scan or paste)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            onClick={() => handleCheckin()}
            loading={loading}
            disabled={!qrToken.trim()}
            className="w-full"
          >
            Check In
          </Button>
        </div>

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-2">
            <p className="text-2xl text-center">✅</p>
            <p className="font-bold text-gray-900 text-center text-lg">{result.attendeeName}</p>
            <div className="text-sm text-gray-600 text-center space-y-0.5">
              <p>{result.tierName}</p>
              <p>{result.eventTitle}</p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
