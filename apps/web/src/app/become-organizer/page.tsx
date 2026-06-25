'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import Navbar from '@/components/Navbar';

// ── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface OrgData {
  id: string;
  name: string;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'form' }
  | { kind: 'status'; org: OrgData };

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateWebsite(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must start with http:// or https://';
    }
    return null;
  } catch {
    return 'Enter a valid URL (e.g. https://yourcompany.com)';
  }
}

function extractApiError(err: unknown): string | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { message?: string | string[] } } }).response;
    const msg = resp?.data?.message;
    if (Array.isArray(msg)) return msg[0] ?? null;
    if (typeof msg === 'string') return msg;
  }
  return null;
}

// ── Status cards ──────────────────────────────────────────────────────────────

function PendingCard({ org }: { org: OrgData }) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 mb-6" aria-hidden="true">
        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Application under review</h2>
      <p className="text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{org.name}</span>
      </p>
      <p className="text-sm text-gray-500 mb-8">
        Submitted {new Date(org.createdAt).toLocaleDateString('en-PH', { dateStyle: 'long' })}
      </p>

      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-5 text-left space-y-3 mb-8">
        <p className="text-sm font-semibold text-amber-800">What happens next?</p>
        <ul className="space-y-2 text-sm text-amber-700">
          {[
            'Our team reviews your organization details, usually within 1–2 business days.',
            "You'll receive an email notification when a decision is made.",
            'Once approved, you can create events and start selling tickets immediately.',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center mt-0.5" aria-hidden="true">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to homepage
      </Link>
    </div>
  );
}

function ApprovedCard({ org }: { org: OrgData }) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-6" aria-hidden="true">
        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re an approved organizer</h2>
      <p className="text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{org.name}</span>
      </p>
      {org.approvedAt && (
        <p className="text-sm text-gray-500 mb-8">
          Approved {new Date(org.approvedAt).toLocaleDateString('en-PH', { dateStyle: 'long' })}
        </p>
      )}
      <div className="bg-violet-50 border border-violet-100 rounded-2xl px-6 py-4 text-left mb-6">
        <p className="text-sm font-semibold text-violet-800 mb-1">What&apos;s next?</p>
        <p className="text-sm text-violet-700">
          Our team will reach out with next steps for creating your first event. In the meantime, explore upcoming events or check back soon for your organizer portal.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to homepage
      </Link>
    </div>
  );
}

function RejectedCard({ org, onReapply }: { org: OrgData; onReapply: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-6" aria-hidden="true">
        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Application not approved</h2>
      <p className="text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{org.name}</span>
      </p>
      {org.rejectedAt && (
        <p className="text-sm text-gray-500 mb-6">
          Reviewed {new Date(org.rejectedAt).toLocaleDateString('en-PH', { dateStyle: 'long' })}
        </p>
      )}
      {org.rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-6 py-4 text-left mb-8">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1.5">Reason provided</p>
          <p className="text-sm text-red-800">{org.rejectionReason}</p>
        </div>
      )}
      <p className="text-sm text-gray-500 mb-6">
        If you believe this was a mistake or have addressed the issue, you can submit a new application.
      </p>
      <button
        onClick={onReapply}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        Submit a new application
      </button>
    </div>
  );
}

function SuspendedCard({ org }: { org: OrgData }) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-6" aria-hidden="true">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Account suspended</h2>
      <p className="text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{org.name}</span>
      </p>
      <p className="text-sm text-gray-500 mb-8">
        Your organizer account has been suspended. Please contact support for assistance.
      </p>
      <a
        href="mailto:support@axontickets.online"
        className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        Contact support
      </a>
    </div>
  );
}

// ── Unauthenticated landing ───────────────────────────────────────────────────

function UnauthenticatedLanding() {
  const benefits = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
        </svg>
      ),
      title: 'Sell tickets effortlessly',
      desc: 'Create ticket tiers, set capacity limits, and accept payments — all in one place.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
      title: 'Reach your audience',
      desc: 'Get listed on Axon Tickets and be discovered by thousands of attendees across the Philippines.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      title: 'Real-time analytics',
      desc: 'Track registrations, revenue, and attendance with a live readiness dashboard built for event day.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ),
      title: 'Trusted & secure',
      desc: 'Every organizer is manually reviewed before going live — protecting attendees and your reputation.',
    },
  ];

  return (
    <div>
      <div className="text-center mb-14">
        <span className="inline-block bg-violet-50 text-violet-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
          Organizer Program
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
          Bring your event to life
          <br />
          <span className="text-violet-600">with Axon Tickets</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
          Join hundreds of organizers selling tickets, managing attendees, and running professional events — all on one platform.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/access?redirect=/become-organizer"
            className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base"
          >
            Apply as an organizer
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link
            href="/auth/login?redirect=/become-organizer"
            className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 font-semibold px-7 py-3.5 rounded-xl transition-colors text-base"
          >
            Sign in to apply
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
        {benefits.map((b) => (
          <div
            key={b.title}
            className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              {b.icon}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm mb-0.5">{b.title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Registration form ─────────────────────────────────────────────────────────

interface FormFields {
  name: string;
  description: string;
  website: string;
  phone: string;
  city: string;
}

const EMPTY_FORM: FormFields = { name: '', description: '', website: '', phone: '', city: '' };

function RegistrationForm({ onSuccess }: { onSuccess: (org: OrgData) => void }) {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormFields>>({});
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function validate(): boolean {
    const next: Partial<FormFields> = {};

    if (!form.name.trim()) {
      next.name = 'Organization name is required';
    } else if (form.name.trim().length < 2) {
      next.name = 'Name must be at least 2 characters';
    } else if (form.name.trim().length > 120) {
      next.name = 'Name must be 120 characters or fewer';
    }

    if (form.description.length > 500) {
      next.description = 'Description must be 500 characters or fewer';
    }

    if (form.website) {
      const webErr = validateWebsite(form.website.trim());
      if (webErr) next.website = webErr;
      else if (form.website.trim().length > 200) next.website = 'URL too long (max 200 characters)';
    }

    if (form.phone && form.phone.trim().length > 30) {
      next.phone = 'Phone number too long (max 30 characters)';
    }

    if (form.city && form.city.trim().length > 80) {
      next.city = 'City name too long (max 80 characters)';
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      // Move focus to the first field with an error
      const firstKey = Object.keys(next)[0] as keyof FormFields;
      const el = document.getElementById(`org-field-${firstKey}`);
      if (el) (el as HTMLElement).focus();
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Partial<FormFields> = { name: form.name.trim() };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.city.trim()) payload.city = form.city.trim();

      const res = await api.post<{ data: OrgData }>('/organizations', payload);
      toast.success('Application submitted!');
      onSuccess(res.data.data);
    } catch (err: unknown) {
      const msg = extractApiError(err);
      if (msg?.toLowerCase().includes('already')) {
        toast.error('You already have an organization registered.');
      } else {
        toast.error(msg || 'Could not submit. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Focus name field on mount
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4" aria-hidden="true">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Register your organization</h1>
        <p className="text-sm text-gray-500">
          Tell us about your organization. Our team will review your application within 1–2 business days.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="org-field-name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Organization name <span className="text-red-500" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            ref={nameRef}
            id="org-field-name"
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Acme Events Inc."
            maxLength={120}
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'org-err-name' : undefined}
            className={`w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
              errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {errors.name && (
            <p id="org-err-name" role="alert" className="text-xs text-red-600 mt-1">{errors.name}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="org-field-description" className="block text-sm font-medium text-gray-700 mb-1.5">
            Description
            <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="org-field-description"
            value={form.description}
            onChange={set('description')}
            rows={3}
            maxLength={500}
            placeholder="What kind of events does your organization produce?"
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'org-err-description' : 'org-desc-count'}
            className={`w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition resize-none ${
              errors.description ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          <div className="flex justify-between mt-1">
            {errors.description ? (
              <p id="org-err-description" role="alert" className="text-xs text-red-600">{errors.description}</p>
            ) : (
              <span />
            )}
            <span
              id="org-desc-count"
              aria-live="polite"
              className={`text-xs ${form.description.length > 450 ? 'text-amber-600' : 'text-gray-400'}`}
            >
              {form.description.length}/500
            </span>
          </div>
        </div>

        {/* Two-column row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* City */}
          <div>
            <label htmlFor="org-field-city" className="block text-sm font-medium text-gray-700 mb-1.5">
              City
              <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="org-field-city"
              type="text"
              value={form.city}
              onChange={set('city')}
              placeholder="e.g. Manila"
              maxLength={80}
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? 'org-err-city' : undefined}
              className={`w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                errors.city ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.city && (
              <p id="org-err-city" role="alert" className="text-xs text-red-600 mt-1">{errors.city}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="org-field-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
              Contact phone
              <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="org-field-phone"
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+639171234567"
              maxLength={30}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'org-err-phone' : undefined}
              className={`w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                errors.phone ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.phone && (
              <p id="org-err-phone" role="alert" className="text-xs text-red-600 mt-1">{errors.phone}</p>
            )}
          </div>
        </div>

        {/* Website */}
        <div>
          <label htmlFor="org-field-website" className="block text-sm font-medium text-gray-700 mb-1.5">
            Website
            <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="org-field-website"
            type="url"
            value={form.website}
            onChange={set('website')}
            placeholder="https://yourcompany.com"
            maxLength={200}
            aria-invalid={!!errors.website}
            aria-describedby={errors.website ? 'org-err-website' : undefined}
            className={`w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
              errors.website ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {errors.website && (
            <p id="org-err-website" role="alert" className="text-xs text-red-600 mt-1">{errors.website}</p>
          )}
        </div>

        {/* Notice */}
        <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-4 py-3">
          <svg className="flex-shrink-0 w-4 h-4 text-gray-400 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your application will be reviewed by our team before you can publish events. You&apos;ll be notified by email within 1–2 business days.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                role="status"
                aria-label="Submitting…"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting…
            </>
          ) : (
            'Submit application'
          )}
        </button>
      </form>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BecomeOrganizerPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, user } = useAuthStore();
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    if (isHydrating) return;

    if (!isAuthenticated) {
      setPageState({ kind: 'unauthenticated' });
      return;
    }

    if (user?.isAdmin) {
      router.replace('/admin/organizers');
      return;
    }

    api
      .get<{ data: OrgData }>('/organizations/me')
      .then((res) => {
        setPageState({ kind: 'status', org: res.data.data });
      })
      .catch((err: unknown) => {
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 404) {
          setPageState({ kind: 'form' });
        } else {
          toast.error('Could not load your organization status. Please try again.');
          setPageState({ kind: 'form' });
        }
      });
  }, [isHydrating, isAuthenticated, user, router]);

  function handleRegistrationSuccess(org: OrgData) {
    setPageState({ kind: 'status', org });
  }

  function handleReapply() {
    setPageState({ kind: 'form' });
  }

  function renderContent() {
    switch (pageState.kind) {
      case 'loading':
        return (
          <div className="flex items-center justify-center py-24">
            <svg
              className="w-8 h-8 animate-spin text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
              role="status"
              aria-label="Loading"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        );
      case 'unauthenticated':
        return <UnauthenticatedLanding />;
      case 'form':
        return <RegistrationForm onSuccess={handleRegistrationSuccess} />;
      case 'status': {
        const { org } = pageState;
        if (org.approvalStatus === 'pending') return <PendingCard org={org} />;
        if (org.approvalStatus === 'approved') return <ApprovedCard org={org} />;
        if (org.approvalStatus === 'rejected') return <RejectedCard org={org} onReapply={handleReapply} />;
        if (org.approvalStatus === 'suspended') return <SuspendedCard org={org} />;
        return <PendingCard org={org} />;
      }
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 px-4 py-12 sm:py-16">
        {renderContent()}
      </main>
    </>
  );
}
