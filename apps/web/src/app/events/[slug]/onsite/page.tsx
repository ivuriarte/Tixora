'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ScreenSkeleton } from '@/components/ScreenState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

interface Tier {
  id: string;
  name: string;
  availableQuantity: number;
  isSoldOut: boolean;
}

interface AgendaSubEvent {
  id: string;
  title: string;
  time?: string;
}

interface EventData {
  id: string;
  slug: string;
  title: string;
  venue: string;
  startsAt: string;
  status: string;
  onsiteRegistrationEnabled: boolean;
  tiers: Tier[];
  agenda?: Array<{ id?: string; title?: string; time?: string; isSubEvent?: boolean }> | null;
  optionalInclusions?: Array<{ id: string; name: string }>;
}

interface OnsiteResult {
  created: boolean;
  attendee: { id: string; firstName: string; lastName: string; email: string | null };
  registration: { referenceNumber: string; tierName: string | null };
  attendance: { checkInDate: string; checkedInAt: string };
}

const blankForm = {
  tierId: '',
  subEventIds: [] as string[],
  firstName: '',
  lastName: '',
  email: '',
  emailNotApplicable: false,
  contactNumber: '',
  gender: '',
  birthday: '',
  city: '',
  company: '',
  jobTitle: '',
};

interface ProfileSuggestion {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  gender: string;
  birthday: string;
  city: string;
  company: string;
  jobTitle: string;
  maskedEmail: string;
}

function getSubEvents(event?: EventData | null): AgendaSubEvent[] {
  return Array.isArray(event?.agenda)
    ? event.agenda
        .filter((item) => item?.isSubEvent === true && typeof item.id === 'string' && item.id.trim() && typeof item.title === 'string' && item.title.trim())
        .map((item) => ({
          id: item.id!.trim(),
          title: item.title!.trim(),
          ...(item.time?.trim() ? { time: item.time.trim() } : {}),
        }))
    : [];
}

function statusLabel(status?: string) {
  return (status || '').replace(/_/g, ' ');
}

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function OnsiteRegistrationPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { eventId?: string | string[] };
}) {
  const eventId = firstSearchParam(searchParams?.eventId).trim();
  const eventQuery = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  const [event, setEvent] = useState<EventData | null>(null);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnsiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ProfileSuggestion | null>(null);
  const [checkingSuggestion, setCheckingSuggestion] = useState(false);
  const subEvents = useMemo<AgendaSubEvent[]>(() => getSubEvents(event), [event]);
  const registrationOpen = event?.onsiteRegistrationEnabled === true && event.status === 'on_sale';

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ data: EventData }>(`${API_URL}/events/${params.slug}${eventQuery}`)
      .then((res) => {
        if (cancelled) return;
        const nextEvent = res.data.data;
        const nextSubEvents = getSubEvents(nextEvent);
        setEvent(nextEvent);
        setForm((current) => ({
          ...current,
          tierId: current.tierId || nextEvent.tiers.find((tier) => !tier.isSoldOut)?.id || nextEvent.tiers[0]?.id || '',
          subEventIds: current.subEventIds.length > 0 ? current.subEventIds : nextSubEvents.map((item) => item.id),
        }));
      })
      .catch(() => setError('Could not load this event. Please ask staff for assistance.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, eventQuery]);

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleSubEvent(id: string) {
    setForm((current) => {
      const selected = new Set(current.subEventIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...current, subEventIds: Array.from(selected) };
    });
  }

  function selectAllSubEvents() {
    setForm((current) => ({ ...current, subEventIds: subEvents.map((item) => item.id) }));
  }

  function clearSubEvents() {
    setForm((current) => ({ ...current, subEventIds: [] }));
  }

  function messageFromError(err: unknown) {
    const e = err as { response?: { status?: number; data?: { message?: unknown; errors?: unknown } } };
    const errors = e.response?.data?.errors;
    if (Array.isArray(errors) && errors.length > 0) return errors.join(' ');
    const raw = e.response?.data?.message;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw.length > 0) return raw.join(' ');
    if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as { message?: string }).message);
    return e.response?.status === 409 ? 'You are already checked in for today.' : 'Submission failed. Please try again.';
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
          eventId: eventId || undefined,
          subEventIds: form.subEventIds,
          emailNotApplicable: form.emailNotApplicable,
          email: form.emailNotApplicable ? undefined : form.email.trim().toLowerCase(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          contactNumber: form.contactNumber.trim(),
          city: form.city.trim(),
          company: form.company.trim() || undefined,
          jobTitle: form.jobTitle.trim() || undefined,
        },
      );
      const payload = res.data.data;
      setResult(payload);
      setForm((current) => ({ ...blankForm, tierId: current.tierId, subEventIds: subEvents.map((item) => item.id) }));
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!registrationOpen || result || form.emailNotApplicable) {
      if (form.emailNotApplicable) setSuggestion(null);
      return;
    }
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (firstName.length < 2 || lastName.length < 2) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCheckingSuggestion(true);
      axios
        .post<{ data: { match: ProfileSuggestion | null } }>(
          `${API_URL}/events/${params.slug}/onsite-registration/suggestions`,
          { firstName, lastName, eventId: eventId || undefined },
        )
        .then((res) => {
          if (!cancelled) setSuggestion(res.data.data.match);
        })
        .catch(() => {
          if (!cancelled) setSuggestion(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingSuggestion(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, form.emailNotApplicable, form.firstName, form.lastName, params.slug, registrationOpen, result]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f0ff] px-4 py-8">
        <div className="mx-auto max-w-md"><ScreenSkeleton rows={5} /></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-5 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-md space-y-5">
        <header className="rounded-lg bg-[#1a0533] p-5 text-white">
          <p className="axon-label text-xs text-[#a78bfa]">On-site Registration</p>
          <h1 className="axon-display mt-2 text-3xl leading-tight">{event?.title ?? 'Event'}</h1>
          {event && (
            <p className="mt-2 text-sm text-[#c4b5fd]">
              {new Date(event.startsAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })} · {event.venue}
            </p>
          )}
        </header>

        {!event?.onsiteRegistrationEnabled ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-semibold text-amber-900">On-site registration is not enabled.</p>
            <p className="mt-1 text-sm text-amber-700">Please ask the event staff for assistance.</p>
          </section>
        ) : event.status !== 'on_sale' ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-semibold text-amber-900">Registration is not open right now.</p>
            <p className="mt-1 text-sm text-amber-700">
              This event is currently {statusLabel(event.status)}. Please ask the event staff when on-site registration will open.
            </p>
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
              <p className="text-sm text-gray-500">{result.attendee.email ?? 'No email provided'}</p>
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
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 sm:p-5">
            {!!event.optionalInclusions?.length && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
                <span className="font-semibold">Optional add-ons are unavailable at on-site registration.</span>{' '}
                This form records admission only. Ask event staff about any separately available merchandise or services.
              </div>
            )}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900">
              <span className="font-semibold">Please share your email if you have one.</span> We use it only to create your Axon Tickets account, send event confirmations, and make future event-day check-ins faster. If you genuinely do not have an email address, choose <span className="font-semibold">Email not applicable</span> below and staff can still record your attendance.
            </div>
            {event.tiers.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration type</label>
                <select
                  value={form.tierId}
                  onChange={(e) => field('tierId', e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary sm:py-2.5 sm:text-sm"
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

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={(v) => field('firstName', v)} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={(v) => field('lastName', v)} autoComplete="family-name" />
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(v) => field('email', v)}
                autoComplete="email"
                disabled={form.emailNotApplicable}
                required={!form.emailNotApplicable}
              />
              <label className="mt-3 flex items-start gap-3 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={form.emailNotApplicable}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((current) => ({ ...current, emailNotApplicable: checked, email: checked ? '' : current.email }));
                    setSuggestion(null);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-primary focus:ring-primary"
                />
                <span>
                  <span className="font-semibold">Email not applicable</span>
                  <span className="mt-1 block text-xs leading-relaxed text-amber-800">
                    Use this only when the attendee genuinely has no email address. Without an email, we cannot create an Axon Tickets account or send digital confirmations for them.
                  </span>
                </span>
              </label>
            </div>
            {checkingSuggestion && (
              <p className="text-xs text-gray-500">Checking saved attendee details…</p>
            )}
            {suggestion && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-900">Saved details found for {suggestion.firstName} {suggestion.lastName}</p>
                <p className="mt-1 text-xs text-emerald-800">Use saved details from {suggestion.maskedEmail}, then choose today&apos;s sub-events.</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      firstName: suggestion.firstName,
                      lastName: suggestion.lastName,
                      email: suggestion.email,
                      emailNotApplicable: false,
                      contactNumber: suggestion.contactNumber,
                      gender: suggestion.gender,
                      birthday: suggestion.birthday,
                      city: suggestion.city,
                      company: suggestion.company,
                      jobTitle: suggestion.jobTitle,
                    }));
                    setSuggestion(null);
                  }}
                  className="mt-3 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Fill in my details
                </button>
              </div>
            )}
            <Field label="Contact number" type="tel" value={form.contactNumber} onChange={(v) => field('contactNumber', v)} autoComplete="tel" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => field('gender', e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary sm:py-2.5 sm:text-sm"
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
            <Field label="City" value={form.city} onChange={(v) => field('city', v)} autoComplete="address-level2" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company" value={form.company} onChange={(v) => field('company', v)} required={false} />
              <Field label="Title" value={form.jobTitle} onChange={(v) => field('jobTitle', v)} required={false} />
            </div>

            {subEvents.length > 0 && (
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Sub-events to attend</p>
                    <p className="text-xs text-gray-500">All are selected by default. Uncheck only the sessions you will not attend.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <button type="button" onClick={selectAllSubEvents} className="min-h-10 rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                      Select all
                    </button>
                    <button type="button" onClick={clearSubEvents} className="min-h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {subEvents.map((item) => (
                    <label key={item.id} className="flex min-h-12 items-start gap-3 rounded-lg border border-gray-200 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={form.subEventIds.includes(item.id)}
                        onChange={() => toggleSubEvent(item.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-base leading-snug text-gray-800 sm:text-sm">
                        {item.time && <span className="font-medium text-gray-500">{item.time} - </span>}
                        {item.title}
                      </span>
                    </label>
                  ))}
                </div>
                {form.subEventIds.length === 0 && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Please select at least one sub-event to enable submission.
                  </p>
                )}
              </div>
            )}

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !form.tierId || (subEvents.length > 0 && form.subEventIds.length === 0)}
              className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              {submitting ? 'Submitting…' : 'Submit and Check In'}
            </button>
          </form>
        )}

        {!result && error && event?.onsiteRegistrationEnabled && (
          <button
            type="button"
            onClick={() => {
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:py-2.5 sm:text-sm"
      />
    </div>
  );
}
