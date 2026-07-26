'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type QrScannerType from 'qr-scanner';
import api from '@/lib/api';
import Button from '@/components/Button';
import CheckinPopup, { type PopupConfig, type CheckinResult } from '@/components/admin/CheckinPopup';

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
  subEventTitle?: string | null;
  subEventTime?: string | null;
}

interface Event {
  id: string;
  title: string;
  status: string;
}

type Tab = 'camera' | 'search';

interface CheckinErrorResponse {
  code?: string;
  message?: string;
  checkedInAt?: string | null;
}

function friendlyCheckinError(error: unknown): PopupConfig {
  const response = (error as { response?: { status?: number; data?: CheckinErrorResponse } })?.response;
  const status = response?.status;
  const data = response?.data;
  const message = typeof data?.message === 'string' ? data.message : '';
  const lowerMessage = message.toLowerCase();

  if (data?.code === 'ALREADY_CHECKED_IN' || status === 409 || lowerMessage.includes('already checked in')) {
    const checkedInAt = data?.checkedInAt ? new Date(data.checkedInAt) : null;
    const readableTime = checkedInAt && Number.isFinite(checkedInAt.getTime())
      ? checkedInAt.toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
    return {
      type: 'warning',
      title: 'Ticket already used',
      body: readableTime
        ? `This ticket was checked in on ${readableTime}. Please do not check it in again. If this seems wrong, ask a supervisor for help.`
        : 'This ticket has already been checked in. Please do not check it in again. If this seems wrong, ask a supervisor for help.',
      autoDismiss: false,
      dismissLabel: 'Got it',
    };
  }

  if (lowerMessage.startsWith('this qr is for')) {
    return {
      type: 'warning',
      title: 'Ticket is for another event',
      body: `${message} Select the correct event, then scan the ticket again.`,
      autoDismiss: false,
      dismissLabel: 'Got it',
    };
  }

  if (lowerMessage.includes('not verified')) {
    return {
      type: 'warning',
      title: 'Ticket is not ready',
      body: 'This registration has not been verified yet. Ask a supervisor for help before allowing entry.',
      autoDismiss: false,
      dismissLabel: 'Got it',
    };
  }

  if (status === 404) {
    return {
      type: 'error',
      title: 'Ticket not found',
      body: 'This ticket could not be found. Check that the correct event is selected, then try scanning again.',
      autoDismiss: true,
      dismissMs: 5000,
    };
  }

  if (status && status >= 500) {
    return {
      type: 'error',
      title: 'Could not check ticket',
      body: 'Something went wrong while checking this ticket. Please try again. If it keeps happening, ask a supervisor for help.',
      autoDismiss: false,
      dismissLabel: 'Close',
    };
  }

  return {
    type: 'error',
    title: 'QR code not accepted',
    body: 'This code is not a valid ticket for the selected event. Check the event and try scanning again.',
    autoDismiss: true,
    dismissMs: 5000,
  };
}

export default function AdminCheckinPage() {
  const [tab, setTab] = useState<Tab>('camera');

  // Event selector
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const selectedEventIdRef = useRef('');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);

  // Scanner
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const cameraSessionRef = useRef(0);
  const scanLockRef = useRef(false);

  // Stable ref to the latest handleCheckin so the scanner callback never captures a stale closure
  const handleCheckinRef = useRef<(token: string) => void>(() => {});

  // Audio — created inside a user-gesture handler so iOS allows playback
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Popup
  const [popup, setPopup] = useState<PopupConfig | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<AttendeeRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // ── Load events ────────────────────────────────────────────────────────────

  useEffect(() => {
    api
      .get<{ data: { data: Event[] } }>('/admin/events?limit=100')
      .then((r) => {
        const all: Event[] = r.data?.data?.data ?? [];
        setEvents(all.filter((e) => ['published', 'on_sale', 'ongoing'].includes(e.status)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  // ── Popup ──────────────────────────────────────────────────────────────────

  const closePopup = useCallback(() => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    // Unlock scan immediately so the organizer can scan the next attendee without waiting
    scanLockRef.current = false;
    setPopup(null);
  }, []);

  const openPopup = useCallback((config: PopupConfig) => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    // Do NOT release scanLockRef here — the lock must stay held for the entire
    // duration the popup is visible so the camera cannot re-scan the same code.
    // It is released only when the popup closes (auto-dismiss timer or user tap).
    setPopup(config);
    if (config.autoDismiss) {
      const ms = config.dismissMs ?? 3000;
      popupTimerRef.current = setTimeout(() => {
        popupTimerRef.current = null;
        scanLockRef.current = false;
        setPopup(null);
      }, ms);
    }
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────

  function initAudio() {
    if (audioCtxRef.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    } catch {}
  }

  function playBeep(type: 'success' | 'error') {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    if (type === 'success') {
      // Single clean 880 Hz sine — like a supermarket scanner
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } else {
      // Two short low beeps at 380 Hz to signal a problem
      [0, 0.21].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.28, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.09);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.09);
      });
    }
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  // Full teardown — stop scanning, destroy the instance, release the video element.
  // Called on tab switch, event change, and component unmount.
  const teardownCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    scanLockRef.current = false;
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraStarting(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    if (!selectedEventIdRef.current) {
      openPopup({
        type: 'error',
        title: 'No event selected',
        body: 'Choose an event from the dropdown before starting the camera.',
        autoDismiss: true,
        dismissMs: 3000,
      });
      return;
    }

    // AudioContext must be initialised inside a user-gesture handler on iOS.
    initAudio();

    // Bump the session counter to invalidate any concurrent in-flight start.
    const session = ++cameraSessionRef.current;
    setCameraStarting(true);

    try {
      // Guard against double-start: only create an instance when none exists.
      if (!scannerRef.current) {
        const { default: QrScanner } = await import('qr-scanner');

        // Explicit worker path — avoids bundler path-resolution ambiguity.
        (QrScanner as unknown as { WORKER_PATH: string }).WORKER_PATH =
          '/qr-scanner-worker.min.js';

        if (cameraSessionRef.current !== session) return; // stopCamera while importing

        scannerRef.current = new QrScanner(
          videoRef.current,
          (result: { data: string }) => {
            if (scanLockRef.current) return;
            scanLockRef.current = true;
            handleCheckinRef.current(result.data);
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
            returnDetailedScanResult: true,
          },
        );
      }

      await scannerRef.current.start();

      // Discard if stop was called while scanner.start() was resolving.
      if (cameraSessionRef.current !== session) {
        scannerRef.current?.stop();
        return;
      }

      setCameraActive(true);
      setCameraStarting(false);
    } catch (err: unknown) {
      if (cameraSessionRef.current !== session) return; // stale — ignore

      // On any start error the instance may be in an unknown state — fully
      // tear it down so the next attempt builds a clean one.
      teardownCamera();

      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const lower = msg.toLowerCase();

      if (
        lower.includes('denied') ||
        lower.includes('notallowed') ||
        lower.includes('permission')
      ) {
        // Manual dismiss — organiser must fix browser permissions first.
        openPopup({
          type: 'error',
          title: 'Camera access denied',
          body: 'Open Chrome → Settings → Site Settings → Camera, find this site, and set it to Allow. Then tap Start Camera again.',
          autoDismiss: false,
        });
      } else if (
        lower.includes('not found') ||
        lower.includes('notfound') ||
        lower.includes('no camera')
      ) {
        openPopup({
          type: 'error',
          title: 'No camera found',
          body: 'No camera was detected on this device.',
          autoDismiss: true,
          dismissMs: 3000,
        });
      } else if (lower.includes('insecure') || lower.includes('https')) {
        openPopup({
          type: 'error',
          title: 'HTTPS required',
          body: 'Camera access requires a secure HTTPS connection.',
          autoDismiss: true,
          dismissMs: 3000,
        });
      } else {
        openPopup({
          type: 'error',
          title: 'Camera error',
          body: msg || 'Could not start the camera. Try refreshing the page.',
          autoDismiss: true,
          dismissMs: 3000,
        });
      }
    }
  }, [teardownCamera, openPopup]);

  useEffect(() => {
    if (tab !== 'camera') teardownCamera();
  }, [tab, teardownCamera]);

  useEffect(() => () => teardownCamera(), [teardownCamera]);

  // ── Check-in logic ─────────────────────────────────────────────────────────

  async function handleCheckin(token: string) {
    const t = token.trim();
    if (!t) {
      scanLockRef.current = false;
      return;
    }
    if (!selectedEventIdRef.current) {
      openPopup({
        type: 'error',
        title: 'No event selected',
        body: 'Choose an event before scanning.',
        autoDismiss: true,
        dismissMs: 3000,
      });
      scanLockRef.current = false;
      return;
    }
    try {
      const res = await api.post<{ data: CheckinResult }>('/admin/checkin', {
        qrToken: t,
        eventId: selectedEventIdRef.current,
      });
      const r = res.data.data;
      playBeep('success');
      openPopup({
        type: 'success',
        title: r.attendeeName,
        autoDismiss: true,
        dismissMs: 3000,
        result: r,
      });
    } catch (err: unknown) {
      playBeep('error');
      openPopup(friendlyCheckinError(err));
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
      playBeep('success');
      openPopup({
        type: 'success',
        title: r.attendeeName,
        autoDismiss: true,
        dismissMs: 3000,
        result: r,
      });
      if (searchQ || selectedEventId) await runSearch();
    } catch (err: unknown) {
      playBeep('error');
      openPopup(friendlyCheckinError(err));
    } finally {
      setCheckingInId(null);
    }
  }

  async function runSearch() {
    if (!selectedEventId) {
      openPopup({
        type: 'error',
        title: 'No event selected',
        body: 'Please select an event before searching.',
        autoDismiss: true,
        dismissMs: 3000,
      });
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ data: { data: AttendeeRow[] } }>(
        `/admin/checkin/search?eventId=${selectedEventId}&q=${encodeURIComponent(searchQ)}&limit=30`,
      );
      setSearchResults(res.data?.data?.data ?? []);
    } catch {
      openPopup({
        type: 'error',
        title: 'Search failed',
        body: 'Could not load attendees. Check your connection and try again.',
        autoDismiss: true,
        dismissMs: 3000,
      });
    } finally {
      setSearching(false);
    }
  }

  function handleEventChange(eventId: string) {
    teardownCamera();
    selectedEventIdRef.current = eventId;
    setSelectedEventId(eventId);
    setSearchResults([]);
    setCheckingInId(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <CheckinPopup popup={popup} onClose={closePopup} />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <h1 className="axon-page-title text-3xl sm:text-4xl">Guest Check-In</h1>

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
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
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
                tab === t
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'camera' ? 'Camera' : 'Search'}
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
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/60 text-sm">
                    {cameraStarting ? 'Starting camera…' : 'Camera off'}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={startCamera}
              disabled={!selectedEventId || cameraActive || cameraStarting}
              className="w-full"
            >
              {cameraStarting ? 'Starting…' : 'Start Camera'}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              Point at a QR code to scan automatically.
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
                      {a.subEventTitle && (
                        <p className="text-xs text-violet-600 truncate">
                          {a.subEventTime ? `${a.subEventTime} - ${a.subEventTitle}` : a.subEventTitle}
                        </p>
                      )}
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
                        <span className="text-xs text-amber-600 capitalize">
                          {a.registrationStatus}
                        </span>
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

      </main>
    </>
  );
}
