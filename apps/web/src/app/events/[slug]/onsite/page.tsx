'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

interface Tier {
  id: string;
  name: string;
  availableQuantity: number;
  isSoldOut: boolean;
}

interface EventData {
  id: string;
  slug: string;
  title: string;
  venue: string;
  startsAt: string;
  onsiteRegistrationEnabled: boolean;
  tiers: Tier[];
}

interface OnsiteResult {
  created: boolean;
  attendee: { id: string; firstName: string; lastName: string; email: string };
  registration: { referenceNumber: string; tierName: string | null };
  attendance: { checkInDate: string; checkedInAt: string };
}

const blankForm = {
  tierId: '',
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  gender: '',
  birthday: '',
  company: '',
  jobTitle: '',
};

export default function OnsiteRegistrationPage({ params }: { params: { slug: string } }) {
  const storageKey = useMemo(() => `axon-onsite-attendee:${params.slug}`, [params.slug]);
  const [event, setEvent] = useState<EventData | null>(null);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [autoChecking, setAutoChecking] = useState(false);
  const [result, setResult] = useState<OnsiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ data: EventData }>(`${API_URL}/events/${params.slug}`)
      .then((res) => {
        if (cancelled) return;
        const nextEvent = res.data.data;
        setEvent(nextEvent);
        setForm((current) => ({
          ...current,
          tierId: current.tierId || nextEvent.tiers.find((tier) => !tier.isSoldOut)?.id || nextEvent.tiers[0]?.id || '',
        }));
        const attendeeId = window.localStorage.getItem(storageKey);
        if (attendeeId && nextEvent.onsiteRegistrationEnabled) {
          void checkInExisting(attendeeId);
        }
      })
      .catch(() => setError('Could not load this event. Please ask staff for assistance.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, storageKey]);

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function messageFromError(err: unknown) {
    const e = err as { response?: { status?: number; data?: { message?: unknown } } };
    const raw = e.response?.data?.message;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as { message?: string }).message);
    return e.response?.status === 409 ? 'You are already checked in for today.' : 'Submission failed. Please try again.';
  }

  async function checkInExisting(attendeeId: string) {
    setAutoChecking(true);
    setError(null);
    try {
      const res = await axios.post<{ data: OnsiteResult }>(
        `${API_URL}/events/${params.slug}/onsite-registration`,
        { attendeeId },
      );
      setResult(res.data.data);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setAutoChecking(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post<{ data: OnsiteResult }>(
        `${API_URL}/events/${params.slug}/onsite-registration`,
        {
          ...form,
          email: form.email.trim().toLowerCase(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          contactNumber: form.contactNumber.trim(),
          company: form.company.trim() || undefined,
          jobTitle: form.jobTitle.trim() || undefined,
        },
      );
      const payload = res.data.data;
      window.localStorage.setItem(storageKey, payload.attendee.id);
      setResult(payload);
      setForm((current) => ({ ...blankForm, tierId: current.tierId }));
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading on-site registration…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">On-site Registration</p>
          <h1 className="text-2xl font-bold text-gray-900">{event?.title ?? 'Event'}</h1>
          {event && (
            <p className="text-sm text-gray-500">
              {new Date(event.startsAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })} · {event.venue}
            </p>
          )}
        </header>

        {!event?.onsiteRegistrationEnabled ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-semibold text-amber-900">On-site registration is not enabled.</p>
            <p className="mt-1 text-sm text-amber-700">Please ask the event staff for assistance.</p>
          </section>
        ) : result ? (
          <section className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <p className="text-sm font-semibold text-green-700">
                {result.created ? 'Registration complete' : 'Attendance recorded'}
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                {result.attendee.firstName} {result.attendee.lastName}
              </h2>
              <p className="text-sm text-gray-500">{result.attendee.email}</p>
            </div>
            <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              Checked in for {result.attendance.checkInDate} at{' '}
              {new Date(result.attendance.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </div>
            <p className="text-xs text-gray-500">
              Reference #{result.registration.referenceNumber}. Please proceed to the staff desk for nametag printing.
            </p>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            {event.tiers.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration type</label>
                <select
                  value={form.tierId}
                  onChange={(e) => field('tierId', e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  {event.tiers.map((tier) => (
                    <option key={tier.id} value={tier.id} disabled={tier.isSoldOut}>
                      {tier.name}{tier.isSoldOut ? ' (sold out)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" value={form.firstName} onChange={(v) => field('firstName', v)} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={(v) => field('lastName', v)} autoComplete="family-name" />
            </div>
            <Field label="Email" type="email" value={form.email} onChange={(v) => field('email', v)} autoComplete="email" />
            <Field label="Contact number" type="tel" value={form.contactNumber} onChange={(v) => field('contactNumber', v)} autoComplete="tel" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => field('gender', e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="self_described">Self-described</option>
                </select>
              </div>
              <Field label="Birthday" type="date" value={form.birthday} onChange={(v) => field('birthday', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" value={form.company} onChange={(v) => field('company', v)} required={false} />
              <Field label="Title" value={form.jobTitle} onChange={(v) => field('jobTitle', v)} required={false} />
            </div>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting || autoChecking || !form.tierId}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : autoChecking ? 'Checking in…' : 'Submit and Check In'}
            </button>
          </form>
        )}

        {!result && error && event?.onsiteRegistrationEnabled && (
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(storageKey);
              setError(null);
            }}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-700"
          >
            Use different attendee details
          </button>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = true,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
