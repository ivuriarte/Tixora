'use client';

interface SpinHistoryProps {
  entries: string[];
  label?: string;
}

export default function SpinHistory({ entries, label = 'Spin history' }: SpinHistoryProps) {
  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {label}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">No results yet</p>
      ) : (
        <div className="space-y-0.5">
          {entries.slice(0, 8).map((name, i) => (
            <div key={`${name}-${i}`} className="flex items-center gap-1.5 py-0.5 text-xs">
              <span className="text-primary font-medium">#{i + 1}</span>
              <span className="text-gray-900 truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
