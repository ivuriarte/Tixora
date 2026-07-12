'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface BirthdayPickerProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (value: string) => void;
  className?: string;
}

const digitsOnly = (value: string, maxLength: number) =>
  value.replace(/\D/g, '').slice(0, maxLength);

const toPadded = (value: string) => value.padStart(2, '0');

export default function BirthdayPicker({ value, onChange, className = '' }: BirthdayPickerProps) {
  const [month, setMonth] = useState(() => value?.slice(5, 7) ?? '');
  const [day, setDay] = useState(() => value?.slice(8, 10) ?? '');
  const [year, setYear] = useState(() => value?.slice(0, 4) ?? '');
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const lastEmittedValueRef = useRef(value);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const earliest = useMemo(() => {
    const date = new Date(today);
    date.setFullYear(date.getFullYear() - 120);
    return date;
  }, [today]);

  useEffect(() => {
    if (value === lastEmittedValueRef.current) return;
    setYear(value?.slice(0, 4) ?? '');
    setMonth(value?.slice(5, 7) ?? '');
    setDay(value?.slice(8, 10) ?? '');
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const isEmpty = !month && !day && !year;
    const isComplete = month.length === 2 && day.length === 2 && year.length === 4;
    if (isEmpty || !isComplete) {
      lastEmittedValueRef.current = '';
      onChange('');
      return;
    }

    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const yearNumber = Number(year);
    const birthday = new Date(yearNumber, monthNumber - 1, dayNumber);
    const isCalendarDate =
      birthday.getFullYear() === yearNumber &&
      birthday.getMonth() === monthNumber - 1 &&
      birthday.getDate() === dayNumber;

    if (isCalendarDate && birthday <= today && birthday >= earliest) {
      const nextValue = `${year}-${month}-${day}`;
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    } else {
      lastEmittedValueRef.current = '';
      onChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year]);

  const hasAnyValue = Boolean(month || day || year);
  const isComplete = month.length === 2 && day.length === 2 && year.length === 4;
  const showHint = hasAnyValue && !isComplete;

  function normalizeMonth() {
    if (!month) return;
    const monthNumber = Math.min(12, Math.max(1, Number(month)));
    setMonth(toPadded(String(monthNumber)));
  }

  function normalizeDay() {
    if (!day) return;
    const monthNumber = Math.min(12, Math.max(1, Number(month || '1')));
    const yearNumber = year.length === 4 ? Number(year) : today.getFullYear() - 20;
    const maxDay = new Date(yearNumber, monthNumber, 0).getDate();
    const dayNumber = Math.min(maxDay, Math.max(1, Number(day)));
    setDay(toPadded(String(dayNumber)));
  }

  function normalizeYear() {
    if (!year || year.length < 4) return;
    const minYear = earliest.getFullYear();
    const maxYear = today.getFullYear();
    const yearNumber = Math.min(maxYear, Math.max(minYear, Number(year)));
    setYear(String(yearNumber));
  }

  function handleMonthChange(nextValue: string) {
    const next = digitsOnly(nextValue, 2);
    setMonth(next);
    if (next.length === 2) {
      dayRef.current?.focus();
      dayRef.current?.select();
    }
  }

  function handleDayChange(nextValue: string) {
    const next = digitsOnly(nextValue, 2);
    setDay(next);
    if (next.length === 2) {
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className={className}>
      <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-2">
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Month</span>
          <input
            aria-label="Birth month"
            inputMode="numeric"
            autoComplete="bday-month"
            placeholder="MM"
            value={month}
            onChange={(event) => handleMonthChange(event.target.value)}
            onBlur={normalizeMonth}
            className={inputClass}
          />
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Day</span>
          <input
            ref={dayRef}
            aria-label="Birth day"
            inputMode="numeric"
            autoComplete="bday-day"
            placeholder="DD"
            value={day}
            onChange={(event) => handleDayChange(event.target.value)}
            onBlur={normalizeDay}
            className={inputClass}
          />
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Year</span>
          <input
            ref={yearRef}
            aria-label="Birth year"
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder="YYYY"
            value={year}
            onChange={(event) => setYear(digitsOnly(event.target.value, 4))}
            onBlur={normalizeYear}
            className={inputClass}
          />
        </div>
      </div>
      {showHint && (
        <p className="mt-1 text-[11px] font-medium text-amber-600">
          Complete month, day, and year, or leave birthday blank.
        </p>
      )}
    </div>
  );
}
