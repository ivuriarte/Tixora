'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import WheelCanvas, { type WheelCanvasHandle } from './WheelCanvas';
import ParticipantList from './ParticipantList';
import SpinHistory from './SpinHistory';
import WinnerOverlay from './WinnerOverlay';

interface WheelModeProps {
  names: string[];
}

export default function WheelMode({ names: initialNames }: WheelModeProps) {
  const [pool, setPool] = useState<string[]>(initialNames);
  const [winner, setWinner] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);

  // Settings
  const [removeAfterWin, setRemoveAfterWin] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);

  const wheelRef = useRef<WheelCanvasHandle>(null);

  // Sync pool when parent data changes (e.g. refresh)
  useEffect(() => {
    setPool(initialNames);
  }, [initialNames]);

  const handleWinner = useCallback(
    (name: string) => {
      setSpinning(false);
      setWinner(name);
      setHistory((prev) => [name, ...prev]);
      if (removeAfterWin) {
        setPool((prev) => {
          const idx = prev.indexOf(name);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      }
    },
    [removeAfterWin],
  );

  const handleSpin = useCallback(() => {
    if (spinning || pool.length === 0) return;
    setWinner(null);
    setSpinning(true);
    wheelRef.current?.spin();
  }, [spinning, pool.length]);

  const handleDismiss = useCallback(() => {
    setWinner(null);
  }, []);

  // Spacebar to spin
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleSpin();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSpin]);

  const handleReset = useCallback(() => {
    setPool(initialNames);
    setHistory([]);
    setWinner(null);
  }, [initialNames]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] min-h-[460px]">
      {/* Wheel area */}
      <div className="flex flex-col items-center justify-center p-8 relative">
        <WheelCanvas
          ref={wheelRef}
          names={pool}
          onWinner={handleWinner}
          disabled={spinning}
        />

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSpin}
            disabled={spinning || pool.length === 0}
            className="bg-primary text-white border-none rounded-lg px-8 py-2.5 text-sm font-medium cursor-pointer transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {spinning ? 'Spinning...' : 'Spin the wheel'}
          </button>

          {history.length > 0 && (
            <button
              onClick={handleReset}
              className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              title="Reset pool and history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">or press spacebar</p>

        {/* Winner overlay */}
        {winner && (
          <WinnerOverlay
            name={winner}
            showConfetti={showConfetti}
            onDismiss={handleDismiss}
          />
        )}
      </div>

      {/* Right panel */}
      <div className="border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
        <ParticipantList names={pool} />

        {/* Settings */}
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Settings</p>
          <label className="flex items-center gap-2 text-xs text-gray-900 cursor-pointer mb-1.5">
            <input
              type="checkbox"
              checked={removeAfterWin}
              onChange={(e) => setRemoveAfterWin(e.target.checked)}
              className="accent-primary"
            />
            Remove after win
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-900 cursor-pointer">
            <input
              type="checkbox"
              checked={showConfetti}
              onChange={(e) => setShowConfetti(e.target.checked)}
              className="accent-primary"
            />
            Confetti effect
          </label>
        </div>

        <SpinHistory entries={history} />
      </div>
    </div>
  );
}
