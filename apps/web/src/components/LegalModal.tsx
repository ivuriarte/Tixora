'use client';

import { Fragment, useEffect, useRef } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, Transition } from '@headlessui/react';

interface LegalModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export default function LegalModal({ open, onClose, title, content }: LegalModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-[#1a0533]/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel className="relative flex max-h-[92dvh] w-full flex-col rounded-t-lg border border-[#e4dcf4] bg-white shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-lg">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <Dialog.Title className="axon-section-title pr-4 text-sm leading-snug">
                  {title}
                </Dialog.Title>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[#756a92] transition-colors hover:bg-[#ede9fe] hover:text-primary"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-5 py-5 overscroll-contain">
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-gray-700 leading-relaxed">
                  {content}
                </pre>
              </div>

              {/* Footer */}
              <div className="shrink-0 rounded-b-lg border-t border-[#e4dcf4] bg-[#f5f0ff] px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="axon-pill w-full bg-primary text-sm text-white hover:bg-primary-hover"
                >
                  Close
                </button>
              </div>
            </DialogPanel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
