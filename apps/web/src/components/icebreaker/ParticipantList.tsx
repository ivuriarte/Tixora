'use client';

const COLORS = [
  '#E24B4A', '#378ADD', '#639922', '#EF9F27',
  '#7C3AED', '#D85A30', '#1D9E75', '#D4537E',
  '#5B21B6', '#185FA5', '#3B6D11', '#BA7517',
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface ParticipantListProps {
  names: string[];
  label?: string;
}

export default function ParticipantList({ names, label = 'Participants' }: ParticipantListProps) {
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
            {names.length}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Auto-populated from check-ins</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: 260 }}>
        {names.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No checked-in attendees yet
          </p>
        ) : (
          names.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="flex items-center gap-2 py-1.5 px-1 border-b border-gray-100 last:border-0"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              >
                {getInitials(name)}
              </div>
              <span className="text-xs text-gray-900 truncate">{name}</span>
              <div
                className="w-2 h-2 rounded-full flex-shrink-0 ml-auto"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
