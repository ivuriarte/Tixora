'use client';

/**
 * Small inline ↑/↓ control used wherever the user can rearrange a list of
 * records (ticket tiers, agenda items, sponsors, FAQs, payment methods …).
 * Stays disabled at the boundary positions and is a11y-friendly via title.
 */
export default function ReorderButtons({
  index,
  total,
  onMove,
  className = '',
}: {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  className?: string;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const btn =
    'w-6 h-6 inline-flex items-center justify-center rounded text-gray-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none';

  return (
    <div className={`flex flex-col items-center -my-1 ${className}`}>
      <button
        type="button"
        disabled={isFirst}
        onClick={() => onMove(index, index - 1)}
        title="Move up"
        aria-label="Move up"
        className={btn}
      >
        ▲
      </button>
      <button
        type="button"
        disabled={isLast}
        onClick={() => onMove(index, index + 1)}
        title="Move down"
        aria-label="Move down"
        className={btn}
      >
        ▼
      </button>
    </div>
  );
}

/** Returns a new array with the item at `from` moved to `to` (no mutation). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr;
  }
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
