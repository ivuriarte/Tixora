'use client';

import { useEffect, useRef } from 'react';

export interface CheckinResult {
  valid: boolean;
  attendeeName: string;
  tierName: string | null;
  eventTitle: string;
  checkedInAt: string;
  checkInMethod?: string;
  orderStatus?: string;
  paymentMethod?: string;
}

export interface PopupConfig {
  type: 'success' | 'warning' | 'error';
  /** Primary text — attendee name for success, error title for errors */
  title: string;
  /** Secondary body text, e.g. error instructions */
  body?: string;
  /** Auto-dismiss after dismissMs. False keeps the popup until manually closed. */
  autoDismiss: boolean;
  /** Milliseconds before auto-dismiss. Defaults to 3000. */
  dismissMs?: number;
  /** Clear action label for messages that require acknowledgement. */
  dismissLabel?: string;
  /** Full check-in result to display on success. */
  result?: CheckinResult;
}

interface Props {
  popup: PopupConfig | null;
  onClose: () => void;
}

export default function CheckinPopup({ popup, onClose }: Props) {
  const dismissMs = popup?.dismissMs ?? 3000;

  // Re-key the drain animation whenever a new popup replaces the old one
  // so the bar always starts at 100% width.
  const keyRef = useRef(0);
  const prevPopupRef = useRef<PopupConfig | null>(null);
  if (popup !== prevPopupRef.current) {
    if (popup !== null) keyRef.current += 1;
    prevPopupRef.current = popup;
  }
  const animKey = keyRef.current;

  if (!popup) return null;

  const isSuccess = popup.type === 'success';
  const isWarning = popup.type === 'warning';
  const theme = isSuccess
    ? {
        bar: 'bg-green-500',
        circle: 'bg-green-100',
        icon: 'text-green-700',
        title: 'text-gray-900',
        body: 'text-gray-700',
        track: 'bg-green-100',
        drain: 'bg-green-500',
        button: 'bg-green-700 text-white hover:bg-green-800',
      }
    : isWarning
      ? {
          bar: 'bg-amber-500',
          circle: 'bg-amber-100',
          icon: 'text-amber-800',
          title: 'text-amber-950',
          body: 'text-gray-800',
          track: 'bg-amber-100',
          drain: 'bg-amber-500',
          button: 'bg-amber-500 text-amber-950 hover:bg-amber-400',
        }
      : {
          bar: 'bg-red-500',
          circle: 'bg-red-100',
          icon: 'text-red-700',
          title: 'text-red-800',
          body: 'text-gray-800',
          track: 'bg-red-100',
          drain: 'bg-red-400',
          button: 'bg-red-700 text-white hover:bg-red-800',
        };

  const orderStatusBadge =
    popup.result?.orderStatus ? (
      <span
        className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
          popup.result.orderStatus === 'paid'
            ? 'bg-green-200 text-green-800'
            : popup.result.orderStatus === 'pending'
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        Payment: {popup.result.orderStatus}
        {popup.result.paymentMethod ? ` · ${popup.result.paymentMethod}` : ''}
      </span>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Dismiss"
        tabIndex={-1}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-lg border border-[#e4dcf4] bg-white shadow-2xl animate-popup-enter"
      >
        {/* Top colour bar */}
        <div className={`h-1.5 ${theme.bar}`} />

        <div className="px-6 pt-6 pb-5 space-y-4 text-center">
          {/* Icon circle */}
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${theme.circle}`}
          >
            <svg className={`h-8 w-8 ${theme.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={isSuccess ? 'm5 12 4 4L19 6' : 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'} /></svg>
          </div>

          {/* Title */}
          <p
            className={`text-2xl font-bold leading-tight ${theme.title}`}
          >
            {popup.title}
          </p>

          {/* Body text */}
          {popup.body && (
            <p className={`text-base leading-relaxed ${theme.body}`}>
              {popup.body}
            </p>
          )}

          {/* Success detail card */}
          {popup.result && (
            <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 space-y-1 text-sm text-center">
              {popup.result.tierName && (
                <p className="font-medium text-gray-800">{popup.result.tierName}</p>
              )}
              <p className="text-gray-600">{popup.result.eventTitle}</p>
              <p className="text-xs text-gray-400">
                {popup.result.checkInMethod === 'manual' ? 'Manual check-in' : 'QR scanned'} ·{' '}
                {new Date(popup.result.checkedInAt).toLocaleTimeString()}
              </p>
              {orderStatusBadge && <div className="pt-0.5">{orderStatusBadge}</div>}
            </div>
          )}

          {/* Manual dismiss button (camera permission errors that require action) */}
          {!popup.autoDismiss && (
            <button
              type="button"
              onClick={onClose}
              className={`axon-pill w-full text-sm transition-colors ${theme.button}`}
            >
              {popup.dismissLabel ?? 'Close'}
            </button>
          )}
        </div>

        {/* Draining progress bar — auto-dismiss visual countdown */}
        {popup.autoDismiss && (
          <div className={`h-1 ${theme.track}`}>
            <div
              key={animKey}
              className={`h-full ${theme.drain}`}
              style={{
                animation: `drain ${dismissMs}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
