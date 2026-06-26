'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const cameraActiveRef = useRef(false);
  const cameraStartingRef = useRef(false);
  const scannerSessionRef = useRef(0);
  const selectedEventIdRef = useRef('');
  // Set to true the moment stopCamera() is called so in-flight ZXing frame
  // callbacks immediately bail out and don't re-show errors or re-call stopCamera.
  const stoppingRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  // Scan lock: prevents the ZXing per-frame callback from firing handleCheckin multiple times
  const scanLockRef = useRef(false);
  const handleCheckinRef = useRef<(token: string) => void>(() => {});
  // Cooldown timer: keeps the camera running while preventing repeat reads of
  // the same QR frame while the phone is still pointed at it.
  const scanCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  const stopCamera = useCallback(() => {
    scannerSessionRef.current += 1;
    // Signal immediately so any in-flight ZXing frame callback exits at the top
    // before it can call stopCamera() or setCameraError() a second time.
    stoppingRef.current = true;
    cameraStartingRef.current = false;
    cameraActiveRef.current = false;
    // Clear any pending scan cooldown timer
    if (scanCooldownRef.current) {
      clearTimeout(scanCooldownRef.current);
      scanCooldownRef.current = null;
    }
    // Reset scan lock so the next camera session starts fresh
    scanLockRef.current = false;
    if (scannerControlsRef.current) {
      try { scannerControlsRef.current.stop(); } catch {}
      scannerControlsRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStarting(false);
    setCameraActive(false);
    // Always clear errors when stopping camera to prevent stale messages
    setCameraError('');
  }, []);

  const startCamera = useCallback(async () => {
    const eventId = selectedEventIdRef.current;
    stoppingRef.current = false; // New session — allow callbacks to fire again
    setCameraError('');
    if (!videoRef.current) {
      setCameraError('Camera preview is not ready. Try again in a moment.');
      return;
    }
    if (cameraStartingRef.current) return;
    if (cameraActiveRef.current && scannerControlsRef.current) return;
    if (!eventId) {
      setCameraError('Select an event before starting the camera.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is unavailable in this browser. Open this page in Chrome over HTTPS.');
      return;
    }

    // On Android Chrome, once a permission is permanently blocked, getUserMedia throws
    // NotAllowedError immediately without showing any dialog. Detect this first so we
    // can show actionable instructions instead of looping into the same error.
    try {
      if (navigator.permissions?.query) {
        const ps = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (ps.state === 'denied') {
          setCameraError('permission_blocked');
          return;
        }
      }
    } catch {}

    stopCamera();
    const sessionId = scannerSessionRef.current + 1;
    scannerSessionRef.current = sessionId;
    stoppingRef.current = false;
    cameraStartingRef.current = true;
    cameraActiveRef.current = false;
    setCameraStarting(true);

    // Preflight: call getUserMedia directly first to trigger Android Chrome's
    // permission prompt and confirm the camera is accessible. Android can return
    // NotAllowedError even with permission granted when ZXing's constrained request
    // is the first call — this plain call forces the real system prompt to appear.
    try {
      const preflightStream = await navigator.mediaDevices.getUserMedia({ video: true });
      preflightStream.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      if (scannerSessionRef.current !== sessionId) return;
      stopCamera();
      const name = (err?.name ?? '') as string;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('permission_denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No camera was found on this device.');
      } else {
        setCameraError(`Camera error${name ? ` (${name})` : ''}: ${err?.message ?? 'Unknown error'}`);
      }
      return;
    }

    if (stoppingRef.current || scannerSessionRef.current !== sessionId) return;

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();

      const controls = await reader.decodeFromConstraints({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      }, videoRef.current, (result, err) => {
        // Camera is being torn down — ignore every in-flight callback unconditionally.
        if (stoppingRef.current || scannerSessionRef.current !== sessionId) return;

        if (result) {
          // Guard: ZXing fires this callback on every frame where a QR is visible.
          // Without the lock, handleCheckin would be called 10-30 times before
          // the backend returns, flooding the UI with toasts.
          if (scanLockRef.current) return;
          scanLockRef.current = true;
          handleCheckinRef.current(result.getText());
        }

        if (err) {
          // ZXing fires NotFoundException, ChecksumException, FormatException, and
          // ReedSolomonException on every frame where no valid QR code is visible.
          // These are normal scanning behaviour — NOT errors to show the user.
          // Only surface genuine device/permission failures (DOMExceptions).
          const isDeviceError = err instanceof DOMException ||
            ['NotAllowedError', 'PermissionDeniedError', 'NotFoundError',
             'NotReadableError', 'OverconstrainedError', 'AbortError'].includes((err as any).name ?? '');
          if (!isDeviceError) return; // silently ignore frame-level decode misses

          if (scanLockRef.current) return; // scan already succeeded, camera stopping
          // IMPORTANT: set stoppingRef then call stopCamera() BEFORE setCameraError()
          // so stopCamera's own setCameraError('') does not overwrite our message.
          stoppingRef.current = true;
          stopCamera();
          const errName = (err as any).name ?? '';
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            setCameraError('permission_denied');
          } else {
            setCameraError('Camera device error (' + errName + '). Try refreshing the page.');
          }
        }
      });

      if (stoppingRef.current || scannerSessionRef.current !== sessionId) {
        try { controls.stop(); } catch {}
        return;
      }
      scannerControlsRef.current = controls;
      cameraActiveRef.current = true;
      cameraStartingRef.current = false;
      setCameraActive(true);
      setCameraStarting(false);
    } catch (err: any) {
      const isCurrentSession = scannerSessionRef.current === sessionId;
      if (!isCurrentSession) return;
      stopCamera();
      const name = (err?.name ?? '') as string;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('permission_denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No camera was found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError('Chrome could not start the camera. Close other apps using the camera, then try again.');
      } else {
        setCameraError(`Could not start QR scanner${name ? ` (${name})` : ''}: ${err?.message ?? 'Unknown error'}`);
      }
    }
  }, [stopCamera]);

  // Runs the same user-gesture camera start path Chrome uses for permission prompts.
  const requestCameraAccess = useCallback(async () => {
    // If the permission is permanently blocked, calling getUserMedia again won't
    // show the system dialog — it just throws immediately. Show instructions instead.
    try {
      if (navigator.permissions?.query) {
        const ps = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (ps.state === 'denied') {
          setCameraError('permission_blocked');
          return;
        }
      }
    } catch {}
    await startCamera();
  }, [startCamera]);

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
      if (!selectedEventId) {
        toast.error('Select an event before scanning.');
        scanLockRef.current = false;
        return;
      }
      const res = await api.post<{ data: CheckinResult }>('/admin/checkin', {
        qrToken: t,
        eventId: selectedEventId,
      });
      const r = res.data.data;
      setResult(r);
      // Use a fixed toast ID so rapid duplicate calls replace the toast instead of stacking
      toast.success(`✅ ${r.attendeeName} checked in!`, { id: 'checkin', duration: 2500 });
      scanCooldownRef.current = setTimeout(() => {
        setResult(null);
        scanLockRef.current = false;
        scanCooldownRef.current = null;
      }, 2500);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? 'Invalid ticket';
      if (status === 409) {
        toast.error(`Already checked in — ${msg}`, { id: 'checkin', duration: 3500 });
      } else {
        toast.error(msg, { id: 'checkin', duration: 3500 });
      }
      scanCooldownRef.current = setTimeout(() => {
        setResult(null);
        scanLockRef.current = false;
        scanCooldownRef.current = null;
      }, 3500);
    }
  }

  handleCheckinRef.current = handleCheckin;

  async function handleManualCheckin(attendeeId: string) {
    setCheckingInId(attendeeId);
    try {
      const res = await api.post<{ data: CheckinResult }>(`/admin/checkin/manual/${attendeeId}`, {
        eventId: selectedEventId,
      });
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

  function handleEventChange(eventId: string) {
    stopCamera();
    selectedEventIdRef.current = eventId;
    setSelectedEventId(eventId);
    setResult(null);
    setSearchResults([]);
    setCheckingInId(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Guest Check-In</h1>

        {/* Event selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
          <select
            value={selectedEventId}
            onChange={(e) => handleEventChange(e.target.value)}
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
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/60 text-sm">Camera off</span>
                </div>
              )}
            </div>
            {cameraError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-red-600 text-sm flex-1">
                    {cameraError === 'permission_denied'
                      ? 'Camera access was denied. Tap "Request Camera Access" below — or open Chrome → Settings → Site Settings → Camera and allow this site.'
                      : cameraError === 'permission_blocked'
                      ? 'Camera is blocked in Chrome. To fix: tap the 🔒 lock icon in the address bar → Permissions → Camera → Allow. Then tap "Start Camera" again.'
                      : cameraError}
                  </span>
                  <button
                    onClick={() => setCameraError('')}
                    className="text-red-400 hover:text-red-600 font-bold text-lg leading-none -mt-0.5 flex-shrink-0"
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
                {(cameraError === 'permission_denied' || cameraError === 'permission_blocked') && (
                  <button
                    onClick={cameraError === 'permission_blocked' ? () => setCameraError('') : requestCameraAccess}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg py-2 px-4 transition-colors"
                  >
                    {cameraError === 'permission_blocked' ? 'OK, I\'ll fix it in Settings' : 'Request Camera Access'}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={() => startCamera()}
                disabled={!selectedEventId || cameraActive || cameraStarting}
                className="flex-1"
              >
                {cameraStarting ? 'Starting…' : 'Start Camera'}
              </Button>
              <Button
                onClick={stopCamera}
                disabled={!cameraActive}
                className="flex-1 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"
              >
                Stop Camera
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
          <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-6 space-y-2 shadow-lg animate-fade-in-up" role="status" aria-live="polite">
            <p className="text-4xl text-center">✅</p>
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
                // Keep the camera running; only dismiss the result/cooldown.
                if (scanCooldownRef.current) {
                  clearTimeout(scanCooldownRef.current);
                  scanCooldownRef.current = null;
                }
                scanLockRef.current = false;
                setResult(null);
              }}
              className="block mx-auto text-xs text-gray-400 hover:text-gray-600 mt-2"
            >
              Dismiss
            </button>
          </div>
        )}
    </main>
  );
}
