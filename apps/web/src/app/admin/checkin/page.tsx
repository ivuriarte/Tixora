'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Button from '@/components/Button';

interface CheckinResult {
  valid: boolean;
  attendeeName: string;
  tierName: string | null;
  eventTitle: string;
  checkedInAt: string;
  checkInMethod?: string;
  orderStatus?: string;
  paymentMethod?: string;
}

interface AttendeeRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  tierName: string | null;
  referenceNumber: string;
  eventTitle: string;
  registrationStatus: string;
  checkedInAt: string | null;
  hasQr: boolean;
}

interface Event {
  id: string;
  title: string;
  status: string;
}

type Tab = 'camera' | 'search';

export default function AdminCheckinPage() {
  const [tab, setTab] = useState<Tab>('camera');

  // Event selector
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  // Scan lock: prevents the ZXing per-frame callback from firing handleCheckin multiple times
  const scanLockRef = useRef(false);
  // Auto-restart timer: after a result is shown, restart the camera for the next scan
  const autoRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<AttendeeRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  const [result, setResult] = useState<CheckinResult | null>(null);

  // Load active events on mount
  useEffect(() => {
    api
      .get<{ data: { data: Event[] } }>('/admin/events?limit=100')
      .then((r) => {
        const all: Event[] = r.data?.data?.data ?? [];
        setEvents(all.filter((e) => ['published', 'on_sale', 'ongoing'].includes(e.status)));
      })
      .catch(() => {});
  }, []);

  // ── Camera (ZXing) ─────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    // Clear any pending auto-restart timer
    if (autoRestartRef.current) {
      clearTimeout(autoRestartRef.current);
      autoRestartRef.current = null;
    }
    // Reset scan lock so the next camera session starts fresh
    scanLockRef.current = false;
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!videoRef.current) return;
    try {
      // Dynamically import to avoid SSR issues
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      readerRef.current = reader;
      setCameraActive(true);
      // Await the promise so that a NotAllowedError (camera permission denied)
      // is caught below instead of becoming an unhandled promise rejection.
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          // Guard: ZXing fires this callback on every frame where a QR is visible.
          // Without the lock, handleCheckin would be called 10-30 times before
          // stopCamera() can reset the reader, flooding the UI with toasts.
          if (scanLockRef.current) return;
          scanLockRef.current = true;
          stopCamera();
          handleCheckin(result.getText());
        }
        if (err && !(err.name === 'NotFoundException')) {
          // NotFoundException fires constantly while waiting for QR — suppress it
          if ((err as any).name === 'NotAllowedError') {
            setCameraError('Camera access was denied. Please allow camera access in your browser settings, then try again.');
          } else {
            setCameraError('Camera error. Switch to Search to look up by name or transaction ID.');
          }
          stopCamera();
        }
      });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setCameraError('Camera access was denied. Please allow camera access in your browser settings, then try again.');
      } else {
        setCameraError('Could not access camera. Make sure you allow camera access.');
      }
      setCameraActive(false);
    }
  }, [stopCamera]);

  // Stop camera when switching tabs
  useEffect(() => {
    if (tab !== 'camera') stopCamera();
  }, [tab, stopCamera]);

  // Stop camera on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Check-in actions ───────────────────────────────────────────────────────

  async function handleCheckin(token: string) {
    const t = token.trim();
    if (!t) return;
    setResult(null);
    // Clear any previous camera error on successful scan
    setCameraError('');
    try {
      const res = await api.post<{ data: CheckinResult }>('/admin/checkin', { qrToken: t });
      const r = res.data.data;
      setResult(r);
      // Use a fixed toast ID so rapid duplicate calls replace the toast instead of stacking
      toast.success(`✅ ${r.attendeeName} checked in!`, { id: 'checkin', duration: 2500 });
      // Auto-restart camera after 2.5 s so staff can scan the next attendee immediately
      autoRestartRef.current = setTimeout(() => {
        setResult(null);
        setCameraError(''); // Clear any error before restarting
        startCamera();
      }, 2500);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? 'Invalid ticket';
      if (status === 409) {
        toast.error(`Already checked in — ${msg}`, { id: 'checkin', duration: 3500 });
      } else {
        toast.error(msg, { id: 'checkin', duration: 3500 });
      }
      // Auto-restart on error too — scanner should stay ready
      autoRestartRef.current = setTimeout(() => {
        setResult(null);
        setCameraError(''); // Clear any error before restarting
        startCamera();
      }, 3500);
    } finally {
      // Always release the scan lock so the next scan session can proceed
      scanLockRef.current = false;
    }
  }

  async function handleManualCheckin(attendeeId: string) {
    setCheckingInId(attendeeId);
    try {
      const res = await api.post<{ data: CheckinResult }>(`/admin/checkin/manual/${attendeeId}`);
      const r = res.data.data;
      setResult(r);
      toast.success(`✅ ${r.attendeeName} checked in!`, { id: 'checkin', duration: 2500 });
      // Refresh search results to show updated checkedInAt
      if (searchQ || selectedEventId) await runSearch();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? 'Check-in failed';
      if (status === 409) toast.error(`Already checked in — ${msg}`, { id: 'checkin', duration: 3500 });
      else toast.error(msg, { id: 'checkin', duration: 3500 });
    } finally {
      setCheckingInId(null);
    }
  }

  async function runSearch() {
    if (!selectedEventId) { toast.error('Please select an event from the dropdown above before searching.'); return; }
    setSearching(true);
    try {
      const res = await api.get<{ data: { data: AttendeeRow[] } }>(
        `/admin/checkin/search?eventId=${selectedEventId}&q=${encodeURIComponent(searchQ)}&limit=30`,
      );
      setSearchResults(res.data?.data?.data ?? []);
    } catch {
      toast.error('Attendee search failed. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <BackButton href="/admin" label="Back to Admin" />
        <h1 className="text-2xl font-bold text-gray-900">Check-In Scanner</h1>

        {/* Event selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— Select an event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['camera', 'search'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'camera' ? '📷 Camera' : '🔍 Search'}
            </button>
          ))}
        </div>

        {/* Camera tab */}
        {tab === 'camera' && (
          <div className="bg-white shadow rounded-2xl p-6 space-y-4">
            {!selectedEventId && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-2">
                Select an event above before scanning.
              </p>
            )}
            <div className="relative bg-black rounded-xl overflow-hidden aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/60 text-sm">Camera off</span>
                </div>
              )}
            </div>
            {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
            <div className="flex gap-3">
              <Button
                onClick={startCamera}
                disabled={!selectedEventId || cameraActive}
                className="flex-1"
              >
                Start Camera
              </Button>
              <Button
                onClick={stopCamera}
                disabled={!cameraActive}
                className="flex-1 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"
              >
                Stop
              </Button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Camera requires HTTPS. Point at a QR code to scan automatically.
            </p>
          </div>
        )}

        {/* Search tab */}
        {tab === 'search' && (
          <div className="bg-white shadow rounded-2xl p-6 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Name, email or transaction ID…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button onClick={runSearch} loading={searching} disabled={!selectedEventId}>
                Search
              </Button>
            </div>
            {!selectedEventId && (
              <p className="text-sm text-amber-600">Select an event to search.</p>
            )}
            {searchResults.length > 0 && (
              <div className="divide-y divide-gray-100">
                {searchResults.map((a) => (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {a.firstName} {a.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{a.email}</p>
                      <p className="text-xs text-gray-400">{a.tierName ?? '—'}</p>
                      <p className="text-xs text-gray-400 font-mono"># {a.referenceNumber}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {a.checkedInAt ? (
                        <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          ✓ {new Date(a.checkedInAt).toLocaleTimeString()}
                        </span>
                      ) : a.registrationStatus === 'verified' ? (
                        <Button
                          onClick={() => handleManualCheckin(a.id)}
                          loading={checkingInId === a.id}
                          className="text-xs !py-1 !px-3"
                        >
                          Check In
                        </Button>
                      ) : (
                        <span className="text-xs text-amber-600 capitalize">{a.registrationStatus}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQ && !searching && (
              <p className="text-sm text-gray-400 text-center py-4">No results found.</p>
            )}
          </div>
        )}

        {/* Result card */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-2 animate-fade-in-up" role="status" aria-live="polite">
            <p className="text-2xl text-center">✅</p>
            <p className="font-bold text-gray-900 text-center text-lg">{result.attendeeName}</p>
            <div className="text-sm text-gray-600 text-center space-y-0.5">
              {result.tierName && <p>{result.tierName}</p>}
              <p>{result.eventTitle}</p>
              <p className="text-xs text-gray-400">
                {result.checkInMethod === 'manual' ? 'Manual check-in' : 'Scanned'} ·{' '}
                {new Date(result.checkedInAt).toLocaleTimeString()}
              </p>
              {result.orderStatus && (
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mt-1 ${
                  result.orderStatus === 'paid' ? 'bg-green-100 text-green-700' :
                  result.orderStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  Payment: {result.orderStatus}{result.paymentMethod ? ` · ${result.paymentMethod}` : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                // Cancel auto-restart when user explicitly dismisses — they control the pace
                if (autoRestartRef.current) {
                  clearTimeout(autoRestartRef.current);
                  autoRestartRef.current = null;
                }
                setResult(null);
              }}
              className="block mx-auto text-xs text-gray-400 hover:text-gray-600 mt-2"
            >
              Dismiss
            </button>
          </div>
        )}
      </main>
    </>
  );
}
