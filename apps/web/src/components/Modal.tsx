import { Fragment } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, Transition } from '@headlessui/react';

export default function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="fixed z-50 inset-0 overflow-y-auto" onClose={onClose}>
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
            leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
          >
            <DialogBackdrop className="fixed inset-0 bg-[#1a0533]/55 backdrop-blur-sm transition-opacity" />
          </Transition.Child>

          {/* Centering trick */}
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300" enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95" enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200" leaveFrom="opacity-100 translate-y-0 sm:scale-100" leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel className="inline-block w-full transform overflow-hidden rounded-lg border border-[#e4dcf4] bg-white px-6 pb-5 pt-6 text-left align-bottom shadow-xl transition-all sm:my-8 sm:max-w-md sm:align-middle">
              {title && <Dialog.Title as="h3" className="axon-section-title mb-2 text-lg">{title}</Dialog.Title>}
              {children}
            </DialogPanel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
