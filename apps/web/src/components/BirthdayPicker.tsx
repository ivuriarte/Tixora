'use client';

import { useEffect, useState } from 'react';

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

interface BirthdayPickerProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (value: string) => void;
}

export default function BirthdayPicker({ value, onChange }: BirthdayPickerProps) {
  const [month, setMonth] = useState(() => value?.slice(5, 7) ?? '');
  const [day, setDay] = useState(() => value?.slice(8, 10) ?? '');
  const [year, setYear] = useState(() => value?.slice(0, 4) ?? '');

  const currentYear = new Date().getFullYear();
  // Allow ages 13–120
  const years = Array.from({ length: 107 }, (_, i) => currentYear - 13 - i);

  const daysInMonth =
    month && year
      ? new Date(parseInt(year), parseInt(month), 0).getDate()
      : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    String(i + 1).padStart(2, '0'),
  );

  useEffect(() => {
    if (month && day && year) {
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year]);

  function handleMonthChange(m: string) {
    setMonth(m);
    if (day && m) {
      const yr = year || String(currentYear - 20);
      const maxDays = new Date(parseInt(yr), parseInt(m), 0).getDate();
      if (parseInt(day) > maxDays) setDay(String(maxDays).padStart(2, '0'));
    }
  }

  const sel =
    'min-w-0 w-full border border-gray-300 rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] gap-2">
      <select value={month} onChange={(e) => handleMonthChange(e.target.value)} className={sel}>
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={day}
        onChange={(e) => setDay(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={d}>
            {parseInt(d)}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
