'use client';

import ConfettiEffect from './ConfettiEffect';

interface WinnerOverlayProps {
  name: string;
  showConfetti: boolean;
  onDismiss: () => void;
}

export default function WinnerOverlay({ name, showConfetti, onDismiss }: WinnerOverlayProps) {
  return (
    <div className="absolute inset-0 bg-black/55 flex items-center justify-center z-10 rounded-none">
      {showConfetti && <ConfettiEffect active />}
      <div className="bg-white rounded-xl p-8 text-center max-w-[280px] relative z-20 animate-popup-enter">
        <div className="text-4xl mb-2" aria-hidden="true">🎉</div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Winner</p>
        <p className="text-xl font-medium text-primary mb-4">{name}</p>
        <button
          onClick={onDismiss}
          className="border border-gray-300 rounded-lg px-5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
