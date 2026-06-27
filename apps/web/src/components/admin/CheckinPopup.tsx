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
  type: 'success' | 'error';
  /** Primary text — attendee name for success, error title for errors */
  title: string;
  /** Secondary body text, e.g. error instructions */
  body?: string;
  /** Auto-dismiss after dismissMs. False keeps the popup until manually closed. */
  autoDismiss: boolean;
  /** Milliseconds before auto-dismiss. Defaults to 3000. */
  dismissMs?: number;
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
        className={`relative z-10 w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden animate-popup-enter ${
          isSuccess ? 'bg-white' : 'bg-white'
        }`}
      >
        {/* Top colour bar */}
        <div className={`h-1.5 ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />

        <div className="px-6 pt-6 pb-5 space-y-4 text-center">
          {/* Icon circle */}
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              isSuccess ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <span className="text-3xl leading-none" role="img" aria-hidden>
              {isSuccess ? '✅' : '⚠️'}
            </span>
          </div>

          {/* Title */}
          <p
            className={`text-xl font-bold leading-tight ${
              isSuccess ? 'text-gray-900' : 'text-red-800'
            }`}
          >
            {popup.title}
          </p>

          {/* Body text */}
          {popup.body && (
            <p className={`text-sm leading-relaxed ${isSuccess ? 'text-gray-600' : 'text-red-700'}`}>
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
              className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
            >
              OK, got it
            </button>
          )}
        </div>

        {/* Draining progress bar — auto-dismiss visual countdown */}
        {popup.autoDismiss && (
          <div className={`h-1 ${isSuccess ? 'bg-green-100' : 'bg-red-100'}`}>
            <div
              key={animKey}
              className={`h-full ${isSuccess ? 'bg-green-500' : 'bg-red-400'}`}
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
