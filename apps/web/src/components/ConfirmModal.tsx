'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isDanger = variant === 'danger';

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={loading ? () => {} : onCancel}
      >
        <div className="flex min-h-screen items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              aria-hidden="true"
            />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-2 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-2 sm:scale-95"
          >
            <Dialog.Panel className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                  isDanger ? 'bg-red-100' : 'bg-amber-100'
                }`}
              >
                {isDanger ? (
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
              </div>

              <Dialog.Title as="h2" className="text-center text-lg font-bold text-gray-900 mb-2">
                {title}
              </Dialog.Title>
              <p className="text-center text-sm text-gray-500 leading-relaxed mb-6">
                {message}
              </p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className={`w-full inline-flex items-center justify-center rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                    isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {loading && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {loading ? 'Processing…' : (confirmLabel ?? (isDanger ? 'Delete' : 'Confirm'))}
                </button>
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancelLabel}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
