'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import ParticipantList from './ParticipantList';
import ConfettiEffect from './ConfettiEffect';

const COLORS = [
  '#E24B4A', '#378ADD', '#639922', '#EF9F27',
  '#7C3AED', '#D85A30', '#1D9E75', '#D4537E',
  '#5B21B6', '#185FA5', '#3B6D11', '#BA7517',
];

const MEDALS = ['🥇', '🥈', '🥉', '🎉', '🎉'];

interface DrawRound {
  round: number;
  winners: string[];
}

interface RaffleModeProps {
  names: string[];
}

type DrawState = 'ready' | 'shuffling' | 'results';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function RaffleMode({ names: initialNames }: RaffleModeProps) {
  const [pool, setPool] = useState<string[]>(initialNames);
  const [drawState, setDrawState] = useState<DrawState>('ready');
  const [winnerCount, setWinnerCount] = useState(1);
  const [winners, setWinners] = useState<string[]>([]);
  const [flickName, setFlickName] = useState('');
  const [flickColor, setFlickColor] = useState('#7C3AED');
  const [drawHistory, setDrawHistory] = useState<DrawRound[]>([]);
  const [drawRound, setDrawRound] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  // Settings
  const [removeFromPool, setRemoveFromPool] = useState(true);
  const [showAnimation, setShowAnimation] = useState(true);

  const flickIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Sync pool when parent data changes
  useEffect(() => {
    setPool(initialNames);
  }, [initialNames]);

  const clearTimers = useCallback(() => {
    if (flickIntervalRef.current) clearInterval(flickIntervalRef.current);
    timeoutRefs.current.forEach((t) => clearTimeout(t));
    timeoutRefs.current = [];
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const revealWinners = useCallback(
    (count: number) => {
      // Fisher-Yates shuffle for unbiased random selection
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, count);

      const round = drawRound + 1;
      setDrawRound(round);
      setWinners(selected);
      setDrawHistory((prev) => [{ round, winners: selected }, ...prev]);
      setDrawState('results');
      setShowConfetti(true);

      // Clear confetti after 3s
      const confettiTimeout = setTimeout(() => setShowConfetti(false), 3000);
      timeoutRefs.current.push(confettiTimeout);

      if (removeFromPool) {
        setPool((prev) => prev.filter((n) => !selected.includes(n)));
      }
    },
    [pool, drawRound, removeFromPool],
  );

  const startDraw = useCallback(() => {
    if (drawState === 'shuffling' || pool.length === 0) return;

    const count = Math.min(winnerCount, pool.length);

    if (!showAnimation) {
      revealWinners(count);
      return;
    }

    setDrawState('shuffling');
    setShowConfetti(false);

    // Phase 1: Fast flicker (50ms)
    flickIntervalRef.current = setInterval(() => {
      const rnd = pool[Math.floor(Math.random() * pool.length)];
      setFlickName(rnd);
      setFlickColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }, 50);

    // Phase 2: Medium speed (120ms) after 800ms
    const t1 = setTimeout(() => {
      clearInterval(flickIntervalRef.current);
      flickIntervalRef.current = setInterval(() => {
        const rnd = pool[Math.floor(Math.random() * pool.length)];
        setFlickName(rnd);
        setFlickColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      }, 120);
    }, 800);

    // Phase 3: Slow (220ms) after 1600ms
    const t2 = setTimeout(() => {
      clearInterval(flickIntervalRef.current);
      flickIntervalRef.current = setInterval(() => {
        const rnd = pool[Math.floor(Math.random() * pool.length)];
        setFlickName(rnd);
        setFlickColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      }, 220);
    }, 1600);

    // Reveal after 2800ms
    const t3 = setTimeout(() => {
      clearInterval(flickIntervalRef.current);
      revealWinners(count);
    }, 2800);

    timeoutRefs.current.push(t1, t2, t3);
  }, [drawState, pool, winnerCount, showAnimation, revealWinners]);

  const handleDrawAgain = useCallback(() => {
    setDrawState('ready');
    setWinners([]);
    setShowConfetti(false);
  }, []);

  // Spacebar to draw
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (drawState === 'results') {
          handleDrawAgain();
        } else {
          startDraw();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startDraw, drawState, handleDrawAgain]);

  const handleReset = useCallback(() => {
    clearTimers();
    setPool(initialNames);
    setDrawHistory([]);
    setDrawRound(0);
    setWinners([]);
    setDrawState('ready');
    setShowConfetti(false);
  }, [initialNames, clearTimers]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] min-h-[460px]">
      {/* Raffle area */}
      <div className="flex flex-col items-center justify-center p-8 relative">
        {/* Winner count selector */}
        <div className="flex items-center gap-2.5 mb-6">
          <span className="text-sm text-gray-500">Draw</span>
          <select
            value={winnerCount}
            onChange={(e) => setWinnerCount(Number(e.target.value))}
            disabled={drawState === 'shuffling'}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900 accent-primary disabled:opacity-50"
          >
            <option value={1}>1 winner</option>
            <option value={3}>3 winners</option>
            <option value={5}>5 winners</option>
          </select>
          <span className="text-sm text-gray-500">from pool</span>
        </div>

        {/* Raffle display box */}
        <div className="w-full max-w-[400px] min-h-[220px] bg-gray-50 border border-gray-200 rounded-xl flex flex-col items-center justify-center p-8 overflow-hidden relative">
          {showConfetti && <ConfettiEffect active />}

          {/* Ready state */}
          {drawState === 'ready' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Ready to draw</p>
              <p className="text-xs text-gray-400 mt-1">{pool.length} names in the pool</p>
            </div>
          )}

          {/* Shuffling state */}
          {drawState === 'shuffling' && (
            <div className="text-center w-full">
              <p
                className="text-2xl font-medium min-h-[40px]"
                style={{ color: flickColor }}
                aria-live="polite"
              >
                {flickName}
              </p>
              <p className="text-xs text-gray-400 mt-2">Drawing...</p>
            </div>
          )}

          {/* Results state */}
          {drawState === 'results' && (
            <div className="w-full text-center relative z-10">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3h14l-1.5 5H6.5L5 3zm0 0L3 7.5m16-4.5L21 7.5M12 15a3 3 0 100 6 3 3 0 000-6zm-6.5-4h13l-1 4h-11l-1-4z" />
                </svg>
                Winner{winners.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-2 items-center">
                {winners.map((name, i) => (
                  <div
                    key={`${name}-${i}`}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5 w-full max-w-[300px] animate-fade-in-up"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    >
                      {getInitials(name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-[11px] text-gray-400">Checked in</p>
                    </div>
                    <span className="text-xl" aria-hidden="true">{MEDALS[i] ?? '🎉'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-5">
          {drawState === 'results' ? (
            <button
              onClick={() => {
                handleDrawAgain();
                // Small delay so state resets before the next draw
                setTimeout(startDraw, 50);
              }}
              disabled={pool.length === 0}
              className="bg-primary text-white border-none rounded-lg px-8 py-2.5 text-sm font-medium cursor-pointer transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Draw again
            </button>
          ) : (
            <button
              onClick={startDraw}
              disabled={drawState === 'shuffling' || pool.length === 0}
              className="bg-primary text-white border-none rounded-lg px-8 py-2.5 text-sm font-medium cursor-pointer transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Draw winners
            </button>
          )}

          {drawHistory.length > 0 && (
            <button
              onClick={handleReset}
              disabled={drawState === 'shuffling'}
              className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Reset pool and history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">or press spacebar</p>
      </div>

      {/* Right panel */}
      <div className="border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
        <ParticipantList names={pool} label="Raffle pool" />

        {/* Settings */}
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Settings</p>
          <label className="flex items-center gap-2 text-xs text-gray-900 cursor-pointer mb-1.5">
            <input
              type="checkbox"
              checked={removeFromPool}
              onChange={(e) => setRemoveFromPool(e.target.checked)}
              className="accent-primary"
            />
            Remove winners from pool
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-900 cursor-pointer">
            <input
              type="checkbox"
              checked={showAnimation}
              onChange={(e) => setShowAnimation(e.target.checked)}
              className="accent-primary"
            />
            Shuffle animation
          </label>
        </div>

        {/* Draw history */}
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Draw history
          </p>
          {drawHistory.length === 0 ? (
            <p className="text-xs text-gray-400">No draws yet</p>
          ) : (
            <div className="space-y-1">
              {drawHistory.slice(0, 6).map((d) => (
                <div key={d.round} className="py-1 border-b border-gray-100 last:border-0">
                  <span className="text-[11px] text-primary font-medium">Draw #{d.round}</span>{' '}
                  <span className="text-[11px] text-gray-900">{d.winners.join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
