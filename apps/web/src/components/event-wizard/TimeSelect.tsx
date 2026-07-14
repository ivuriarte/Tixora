'use client';

interface TimeSelectProps {
  value: string;
  onChange: (v: string) => void;
}

export default function TimeSelect({ value, onChange }: TimeSelectProps) {
  const SELECT_CLS =
    'appearance-none rounded-lg border border-gray-300 pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white bg-no-repeat ' +
    "bg-[length:0.7rem] bg-[right_0.6rem_center] " +
    "bg-[url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236B7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")]";

  const isEmpty = !value;
  const parse = (v: string) => {
    if (!v) return { h12: 8, min: 0, period: 'AM' as 'AM' | 'PM' };
    const [hh, mm] = v.split(':').map(Number);
    const period: 'AM' | 'PM' = hh < 12 ? 'AM' : 'PM';
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return { h12, min: mm ?? 0, period };
  };

  const emit = (h12: number, min: number, period: 'AM' | 'PM') => {
    let h24 = h12 === 12 ? 0 : h12;
    if (period === 'PM') h24 += 12;
    if (h12 === 12 && period === 'PM') h24 = 12;
    onChange(`${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  };

  const { h12, min, period } = parse(value);

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <select value={isEmpty ? '' : h12} onChange={(e) => emit(+e.target.value, min, period)} className={SELECT_CLS}>
        {isEmpty && <option value="" disabled>--</option>}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-400 font-bold text-sm select-none">:</span>
      <select value={isEmpty ? '' : min} onChange={(e) => emit(h12, +e.target.value, period)} className={SELECT_CLS}>
        {isEmpty && <option value="" disabled>--</option>}
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <select value={isEmpty ? '' : period} onChange={(e) => emit(h12, min, e.target.value as 'AM' | 'PM')} className={SELECT_CLS}>
        {isEmpty && <option value="" disabled>--</option>}
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
