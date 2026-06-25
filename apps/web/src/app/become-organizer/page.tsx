'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface OrgData {
  id: string;
  name: string;
  description?: string;
  contactName?: string;
  phone?: string;
  city?: string;
  idType?: string;
  idNumber?: string;
  organizationType?: string;
  registrationNumber?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'guest-apply' }
  | { kind: 'form'; org?: OrgData | null }
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
  function goHome() {
    window.location.assign('/');
  }

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

      <button
        type="button"
        onClick={goHome}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to homepage
      </button>
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
          Your organizer dashboard is ready. You can create and manage your own events, review registrations, run check-in, and monitor your event data.
        </p>
      </div>
      <Link
        href="/admin"
        className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        Open organizer dashboard
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
        If you believe this was a mistake or have addressed the issue, you can update this same application.
      </p>
      <button
        onClick={onReapply}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        Update application
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

function UnauthenticatedLanding({ onApply }: { onApply: () => void }) {
  const benefits = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
      title: 'Event Workspace',
      desc: 'A dedicated workspace for every event — tasks, team, vendors, and timeline all in one command center.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      ),
      title: 'Readiness Center',
      desc: 'See exactly what\'s done and what\'s pending before event day. No last-minute surprises, no missed details.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
        </svg>
      ),
      title: 'Sell tickets effortlessly',
      desc: 'Ticket tiers, capacity limits, attendee management, and real-time revenue tracking — all in one place.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      ),
      title: 'KYC-verified organizers',
      desc: 'Every organizer is manually reviewed before going live. Your attendees trust you — and we protect that.',
    },
  ];

  return (
    <div>
      <div className="text-center mb-14">
        <span className="inline-block bg-violet-50 text-violet-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
          Organizer Program
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
          Run seamless events,
          <br />
          <span className="text-violet-600">start to finish</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
          Axon Tickets gives organizers a dedicated workspace per event — tasks, team, vendors, readiness, and ticketing all in one platform. More than ticketing. A reason to stay.
        </p>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onApply}
            className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
          >
            Apply as an organizer
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
          <p className="text-sm text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/organizer?redirect=/become-organizer" className="text-violet-600 hover:text-violet-700 font-medium">
              Sign in as organizer
            </Link>
          </p>
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
  organizationType: string;
  registrationNumber: string;
  contactName: string;
  phone: string;
  city: string;
  idType: string;
  idNumber: string;
  website: string;
  facebookUrl: string;
}

const EMPTY_FORM: FormFields = {
  name: '', description: '', organizationType: '', registrationNumber: '',
  contactName: '', phone: '', city: '',
  idType: '', idNumber: '',
  website: '', facebookUrl: '',
};

const ORG_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual / Freelancer' },
  { value: 'company', label: 'Business / Company' },
  { value: 'ngo', label: 'NGO / Non-profit' },
  { value: 'event_company', label: 'Event management company' },
];

const ID_TYPE_OPTIONS = [
  { value: 'passport', label: 'Philippine Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'umid', label: 'UMID' },
  { value: 'sss', label: 'SSS ID' },
  { value: 'philsys', label: 'PhilSys ID (National ID)' },
  { value: 'postal_id', label: 'Postal ID' },
];

const REQ = <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;
const INP = (err?: string) =>
  `w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${err ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
        {children}
      </h2>
    </div>
  );
}

function toFormFields(org?: OrgData | null): FormFields {
  if (!org) return EMPTY_FORM;
  return {
    name: org.name ?? '',
    description: org.description ?? '',
    organizationType: org.organizationType ?? '',
    registrationNumber: org.registrationNumber ?? '',
    contactName: org.contactName ?? '',
    phone: org.phone ?? '',
    city: org.city ?? '',
    idType: org.idType ?? '',
    idNumber: org.idNumber ?? '',
    website: org.website ?? '',
    facebookUrl: org.facebookUrl ?? '',
  };
}

function RegistrationForm({ onSuccess, initialOrg }: { onSuccess: (org: OrgData) => void; initialOrg?: OrgData | null }) {
  const { user: authUser, setAuth } = useAuthStore();
  const router = useRouter();
  const [form, setForm] = useState<FormFields>(() => toFormFields(initialOrg));
  const [errors, setErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [pendingUserId, setPendingUserId] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormFields, string>> = {};

    if (!form.name.trim()) next.name = 'Organization name is required';
    else if (form.name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    else if (form.name.trim().length > 120) next.name = 'Name must be 120 characters or fewer';

    if (!form.description.trim()) next.description = 'Description is required';
    else if (form.description.trim().length < 20) next.description = 'Describe your organization in at least 20 characters';
    else if (form.description.trim().length > 1000) next.description = 'Description must be 1000 characters or fewer';

    if (!form.organizationType) next.organizationType = 'Select an organization type';

    if (!form.contactName.trim()) next.contactName = 'Contact person name is required';
    else if (form.contactName.trim().length < 2) next.contactName = 'Name must be at least 2 characters';

    if (!form.phone.trim()) next.phone = 'Contact phone is required';
    else if (!/^\+?[0-9\s\-().]{7,25}$/.test(form.phone.trim())) next.phone = 'Enter a valid phone number (e.g. +639171234567)';

    if (!form.city.trim()) next.city = 'City is required';

    if (!form.idType) next.idType = 'Select a government ID type';

    if (!form.idNumber.trim()) next.idNumber = 'ID number is required';
    else if (form.idNumber.trim().length < 4) next.idNumber = 'ID number must be at least 4 characters';

    if (form.website.trim()) {
      const webErr = validateWebsite(form.website.trim());
      if (webErr) next.website = webErr;
    }
    if (form.facebookUrl.trim()) {
      const fbErr = validateWebsite(form.facebookUrl.trim());
      if (fbErr) next.facebookUrl = fbErr;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstKey = Object.keys(next)[0] as keyof FormFields;
      document.getElementById(`org-field-${firstKey}`)?.focus();
      return false;
    }
    return true;
  }

  function buildPayload(): Record<string, string> {
      const payload: Record<string, string> = {
        name: form.name.trim(),
        description: form.description.trim(),
        organizationType: form.organizationType,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        idType: form.idType,
        idNumber: form.idNumber.trim(),
      };
      if (form.registrationNumber.trim()) payload.registrationNumber = form.registrationNumber.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.facebookUrl.trim()) payload.facebookUrl = form.facebookUrl.trim();
      return payload;
  }

  async function submitOrganization(accessToken?: string) {
      const payload = buildPayload();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.axontickets.online/api/v1';
      const res = accessToken
        ? await axios.post<{ data: OrgData }>(`${apiUrl}/organizations`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        : await api.post<{ data: OrgData }>('/organizations', payload);
      toast.success('Application submitted!');
      onSuccess(res.data.data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (initialOrg?.approvalStatus === 'rejected') {
      if (!authUser?.email) {
        toast.error('Please sign in again before resubmitting.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.post<{ data: { userId: string } }>('/auth/request-access', {
          email: authUser.email,
        });
        setPendingUserId(res.data.data.userId);
        setStep('otp');
        setOtp('');
        setOtpError('');
        setTimeout(() => otpRef.current?.focus(), 50);
      } catch (err: unknown) {
        toast.error(extractApiError(err) ?? 'Could not send verification code. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await submitOrganization();
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

  async function handleVerifyResubmission() {
    if (!pendingUserId || otp.length !== 6) return;
    setSubmitting(true);
    setOtpError('');
    try {
      const verifyRes = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/verify-access', { userId: pendingUserId, otp });

      const { user: verifiedUser, accessToken, refreshToken } = verifyRes.data.data;
      setAuth(
        {
          id: verifiedUser.id,
          email: verifiedUser.email,
          firstName: verifiedUser.firstName ?? authUser?.firstName ?? '',
          lastName: verifiedUser.lastName ?? authUser?.lastName ?? '',
          isAdmin: verifiedUser.isAdmin,
          isOrganizer: verifiedUser.isOrganizer,
          isVerified: verifiedUser.isVerified,
        },
        accessToken,
        refreshToken,
      );
      await submitOrganization(accessToken);
    } catch (err: unknown) {
      setOtpError(extractApiError(err) ?? 'Invalid or expired code.');
      setOtp('');
      setTimeout(() => otpRef.current?.focus(), 50);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (step === 'otp' && otp.length === 6) void handleVerifyResubmission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

  useEffect(() => { nameRef.current?.focus(); }, []);

  if (step === 'otp') {
    return (
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4" aria-hidden="true">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify your email</h1>
          <p className="text-sm text-gray-500">
            We sent a 6-digit code to <span className="font-medium text-gray-700">{authUser?.email}</span>. Enter it to resubmit your organizer application.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">
          {otpError && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{otpError}</p>}
          <input
            ref={otpRef}
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
            disabled={submitting}
            placeholder="000000"
            className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl border border-gray-300 px-4 py-4 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
          />
          {submitting && <p className="text-center text-sm text-gray-500">Verifying and resubmitting...</p>}
          <button type="button" onClick={() => { setStep('form'); setOtp(''); setOtpError(''); }} className="w-full text-xs text-gray-400 hover:text-gray-600">
            Back to application form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4" aria-hidden="true">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Organizer application</h1>
        <p className="text-sm text-gray-500">
          Complete your KYC details so our team can verify your identity and organization. All information is kept confidential.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">

        {/* ── Section 1: Organization ── */}
        <SectionHeading>Organization details</SectionHeading>

        <div>
          <label htmlFor="org-field-name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Organization name {REQ}
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
            className={INP(errors.name)}
          />
          {errors.name && <p role="alert" className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="org-field-description" className="block text-sm font-medium text-gray-700 mb-1.5">
            Description {REQ}
            <span className="ml-1.5 text-xs text-gray-400 font-normal">— what kind of events do you produce?</span>
          </label>
          <textarea
            id="org-field-description"
            value={form.description}
            onChange={set('description')}
            rows={3}
            maxLength={1000}
            placeholder="Describe your organization, the types of events you run, and your experience as an event organizer."
            aria-required="true"
            aria-invalid={!!errors.description}
            className={`${INP(errors.description)} resize-none`}
          />
          <div className="flex justify-between mt-1">
            {errors.description
              ? <p role="alert" className="text-xs text-red-600">{errors.description}</p>
              : <span />}
            <span className={`text-xs ${form.description.length > 900 ? 'text-amber-600' : 'text-gray-400'}`}>
              {form.description.length}/1000
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="org-field-organizationType" className="block text-sm font-medium text-gray-700 mb-1.5">
              Organization type {REQ}
            </label>
            <select
              id="org-field-organizationType"
              value={form.organizationType}
              onChange={set('organizationType')}
              aria-required="true"
              aria-invalid={!!errors.organizationType}
              className={INP(errors.organizationType)}
            >
              <option value="">Select type…</option>
              {ORG_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {errors.organizationType && <p role="alert" className="text-xs text-red-600 mt-1">{errors.organizationType}</p>}
          </div>

          <div>
            <label htmlFor="org-field-registrationNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
              DTI / SEC / CDA registration no.
              <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="org-field-registrationNumber"
              type="text"
              value={form.registrationNumber}
              onChange={set('registrationNumber')}
              placeholder="e.g. DTI-123456"
              maxLength={100}
              className={INP(errors.registrationNumber)}
            />
          </div>
        </div>

        {/* ── Section 2: Primary contact ── */}
        <SectionHeading>Primary contact</SectionHeading>

        <div>
          <label htmlFor="org-field-contactName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Contact person full name {REQ}
          </label>
          <input
            id="org-field-contactName"
            type="text"
            value={form.contactName}
            onChange={set('contactName')}
            placeholder="e.g. Juan Dela Cruz"
            maxLength={120}
            aria-required="true"
            aria-invalid={!!errors.contactName}
            className={INP(errors.contactName)}
          />
          {errors.contactName && <p role="alert" className="text-xs text-red-600 mt-1">{errors.contactName}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="org-field-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
              Contact phone {REQ}
            </label>
            <input
              id="org-field-phone"
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+639171234567"
              maxLength={25}
              aria-required="true"
              aria-invalid={!!errors.phone}
              className={INP(errors.phone)}
            />
            {errors.phone && <p role="alert" className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label htmlFor="org-field-city" className="block text-sm font-medium text-gray-700 mb-1.5">
              City {REQ}
            </label>
            <input
              id="org-field-city"
              type="text"
              value={form.city}
              onChange={set('city')}
              placeholder="e.g. Davao City"
              maxLength={80}
              aria-required="true"
              aria-invalid={!!errors.city}
              className={INP(errors.city)}
            />
            {errors.city && <p role="alert" className="text-xs text-red-600 mt-1">{errors.city}</p>}
          </div>
        </div>

        {/* ── Section 3: Identity verification ── */}
        <SectionHeading>Identity verification</SectionHeading>
        <p className="text-xs text-gray-500 -mt-3">
          A valid Philippine government-issued ID is required. This information is used only for KYC verification and kept strictly confidential.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="org-field-idType" className="block text-sm font-medium text-gray-700 mb-1.5">
              Government ID type {REQ}
            </label>
            <select
              id="org-field-idType"
              value={form.idType}
              onChange={set('idType')}
              aria-required="true"
              aria-invalid={!!errors.idType}
              className={INP(errors.idType)}
            >
              <option value="">Select ID type…</option>
              {ID_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {errors.idType && <p role="alert" className="text-xs text-red-600 mt-1">{errors.idType}</p>}
          </div>

          <div>
            <label htmlFor="org-field-idNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
              ID number {REQ}
            </label>
            <input
              id="org-field-idNumber"
              type="text"
              value={form.idNumber}
              onChange={set('idNumber')}
              placeholder="e.g. P1234567A"
              maxLength={50}
              aria-required="true"
              aria-invalid={!!errors.idNumber}
              className={INP(errors.idNumber)}
            />
            {errors.idNumber && <p role="alert" className="text-xs text-red-600 mt-1">{errors.idNumber}</p>}
          </div>
        </div>

        {/* ── Section 4: Online presence ── */}
        <SectionHeading>Online presence <span className="normal-case font-normal text-gray-400">(optional)</span></SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="org-field-website" className="block text-sm font-medium text-gray-700 mb-1.5">
              Website
            </label>
            <input
              id="org-field-website"
              type="url"
              value={form.website}
              onChange={set('website')}
              placeholder="https://yourcompany.com"
              maxLength={200}
              aria-invalid={!!errors.website}
              className={INP(errors.website)}
            />
            {errors.website && <p role="alert" className="text-xs text-red-600 mt-1">{errors.website}</p>}
          </div>

          <div>
            <label htmlFor="org-field-facebookUrl" className="block text-sm font-medium text-gray-700 mb-1.5">
              Facebook page URL
            </label>
            <input
              id="org-field-facebookUrl"
              type="url"
              value={form.facebookUrl}
              onChange={set('facebookUrl')}
              placeholder="https://facebook.com/yourpage"
              maxLength={200}
              aria-invalid={!!errors.facebookUrl}
              className={INP(errors.facebookUrl)}
            />
            {errors.facebookUrl && <p role="alert" className="text-xs text-red-600 mt-1">{errors.facebookUrl}</p>}
          </div>
        </div>

        {/* Notice */}
        <div className="flex items-start gap-2.5 bg-violet-50 rounded-xl px-4 py-3">
          <svg className="flex-shrink-0 w-4 h-4 text-violet-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-violet-700 leading-relaxed">
            Your application will be manually reviewed by our team. You&apos;ll be notified by email within 1–2 business days. Fields marked <span className="text-red-500">*</span> are required.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            disabled={submitting}
            className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-4 py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" role="status" aria-label="Submitting…">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </>
            ) : initialOrg?.approvalStatus === 'rejected' ? 'Resubmit application' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Guest application flow (unauthenticated) ─────────────────────────────────

interface GuestFormData {
  // Account fields
  email: string;
  firstName: string;
  lastName: string;
  phoneDigits: string;
  // KYC fields
  name: string;
  description: string;
  organizationType: string;
  registrationNumber: string;
  contactName: string;
  phone: string;
  city: string;
  idType: string;
  idNumber: string;
  website: string;
  facebookUrl: string;
}

const EMPTY_GUEST: GuestFormData = {
  email: '', firstName: '', lastName: '', phoneDigits: '',
  name: '', description: '', organizationType: '', registrationNumber: '',
  contactName: '', phone: '', city: '',
  idType: '', idNumber: '',
  website: '', facebookUrl: '',
};

const RESEND_COOLDOWN = 60;

function GuestApplicationFlow({ onSuccess }: { onSuccess: (org: OrgData) => void }) {
  const { setAuth } = useAuthStore();
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [form, setForm] = useState<GuestFormData>(EMPTY_GUEST);
  const [errors, setErrors] = useState<Partial<Record<keyof GuestFormData, string>>>({});
  const [otp, setOtp] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [otpError, setOtpError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  useEffect(() => {
    if (otp.length === 6 && step === 'otp') void handleVerifyAndSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const startResendTimer = useCallback(() => {
    setSecondsLeft(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => { if (s <= 1) { clearInterval(timerRef.current!); return 0; } return s - 1; });
    }, 1000);
  }, []);

  function setField(field: keyof GuestFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function validate(): boolean {
    const next: Partial<Record<keyof GuestFormData, string>> = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (!form.firstName.trim()) next.firstName = 'Required';
    if (!form.lastName.trim()) next.lastName = 'Required';
    if (!/^\d{10}$/.test(form.phoneDigits)) next.phoneDigits = 'Enter a valid 10-digit mobile number';

    if (!form.name.trim()) next.name = 'Organization name is required';
    else if (form.name.trim().length < 2) next.name = 'Name must be at least 2 characters';

    if (!form.description.trim()) next.description = 'Description is required';
    else if (form.description.trim().length < 20) next.description = 'Describe your organization in at least 20 characters';

    if (!form.organizationType) next.organizationType = 'Select an organization type';

    if (!form.contactName.trim()) next.contactName = 'Contact person name is required';
    if (!form.phone.trim()) next.phone = 'Contact phone is required';
    else if (!/^\+?[0-9\s\-().]{7,25}$/.test(form.phone.trim())) next.phone = 'Enter a valid phone number';
    if (!form.city.trim()) next.city = 'City is required';

    if (!form.idType) next.idType = 'Select a government ID type';
    if (!form.idNumber.trim()) next.idNumber = 'ID number is required';
    else if (form.idNumber.trim().length < 4) next.idNumber = 'ID number must be at least 4 characters';

    if (form.website.trim()) {
      const webErr = validateWebsite(form.website.trim());
      if (webErr) next.website = webErr;
    }
    if (form.facebookUrl.trim()) {
      const fbErr = validateWebsite(form.facebookUrl.trim());
      if (fbErr) next.facebookUrl = fbErr;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstKey = Object.keys(next)[0] as keyof GuestFormData;
      document.getElementById(`guest-field-${firstKey}`)?.focus();
      return false;
    }
    return true;
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        { email: form.email.trim().toLowerCase() },
        { timeout: 15_000 },
      );
      setPendingUserId(res.data.data.userId);
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (err: unknown) {
      const msg = extractApiError(err) ?? 'Could not send verification code. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyAndSubmit() {
    if (!pendingUserId || otp.length !== 6) return;
    setOtpError('');
    setSubmitting(true);
    try {
      // 1. Verify OTP → get tokens
      const verifyRes = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isNewUser: boolean;
        };
      }>('/auth/verify-access', { userId: pendingUserId, otp });

      const { user: verifiedUser, accessToken, refreshToken, isNewUser } = verifyRes.data.data;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.axontickets.online/api/v1';

      // 2. Complete profile for new users using data from the form
      if (isNewUser) {
        await axios.patch(
          `${apiUrl}/users/me`,
          { firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: `+63${form.phoneDigits}` },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      }

      // 3. Register the organization
      const kycPayload: Record<string, string> = {
        name: form.name.trim(),
        description: form.description.trim(),
        organizationType: form.organizationType,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        idType: form.idType,
        idNumber: form.idNumber.trim(),
      };
      if (form.registrationNumber.trim()) kycPayload.registrationNumber = form.registrationNumber.trim();
      if (form.website.trim()) kycPayload.website = form.website.trim();
      if (form.facebookUrl.trim()) kycPayload.facebookUrl = form.facebookUrl.trim();

      const orgRes = await axios.post<{ data: OrgData }>(
        `${apiUrl}/organizations`,
        kycPayload,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      // 4. Set auth in store
      setAuth(
        {
          id: verifiedUser.id,
          email: verifiedUser.email,
          firstName: form.firstName.trim() || (verifiedUser.firstName ?? ''),
          lastName: form.lastName.trim() || (verifiedUser.lastName ?? ''),
          isAdmin: false,
          isOrganizer: verifiedUser.isOrganizer,
          isVerified: verifiedUser.isVerified,
        },
        accessToken,
        refreshToken,
      );

      toast.success('Application submitted! Welcome to Axon Tickets.');
      onSuccess(orgRes.data.data);
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status : undefined;
      if (status === 401 || (otp.length === 6 && step === 'otp')) {
        // OTP error
        const msg = extractApiError(err) ?? 'Invalid or expired code.';
        setOtpError(msg);
        setOtp('');
        otpRef.current?.focus();
      } else {
        const msg = extractApiError(err) ?? 'Could not submit your application. Please try again.';
        if (msg.toLowerCase().includes('already')) {
          toast.error('An account with this email already has an organization registered.');
        } else {
          toast.error(msg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0) return;
    setSubmitting(true);
    try {
      await api.post('/auth/request-access', { email: form.email.trim().toLowerCase() });
      setOtp('');
      setOtpError('');
      startResendTimer();
      toast.success('A new code has been sent.');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch {
      toast.error('Could not resend code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldCls = (err?: string) =>
    `w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${err ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  const REQ = <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;

  function GuestSectionHeading({ children }: { children: React.ReactNode }) {
    return (
      <div className="pt-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">{children}</h2>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4" aria-hidden="true">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify your email</h1>
          <p className="text-sm text-gray-500">
            We sent a 6-digit code to <span className="font-medium text-gray-700">{form.email}</span>.
            Enter it below to complete your application.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">
          {otpError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{otpError}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3 text-center">Enter the 6-digit code</label>
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
              disabled={submitting}
              placeholder="000000"
              className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl border border-gray-300 px-4 py-4 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
            />
          </div>

          {submitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Verifying &amp; submitting…
            </div>
          )}

          <div className="text-center space-y-2">
            {secondsLeft > 0 ? (
              <p className="text-xs text-gray-400">Resend in <span className="font-medium tabular-nums">{secondsLeft}s</span></p>
            ) : (
              <button type="button" onClick={handleResend} disabled={submitting} className="text-xs text-violet-600 font-medium hover:underline disabled:opacity-50">
                Did not get the code? Resend
              </button>
            )}
            <div>
              <button type="button" onClick={() => { setStep('form'); setOtp(''); setOtpError(''); }} className="text-xs text-gray-400 hover:text-gray-600">
                ← Back to application form
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4" aria-hidden="true">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Organizer application</h1>
        <p className="text-sm text-gray-500">
          Complete your KYC details so our team can verify your identity and organization.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">

        {/* ── Account creation ── */}
        <GuestSectionHeading>Your Axon Tickets account</GuestSectionHeading>

        <div>
          <label htmlFor="guest-field-email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email address {REQ}
          </label>
          <input
            id="guest-field-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={setField('email')}
            placeholder="you@example.com"
            maxLength={200}
            aria-required="true"
            aria-invalid={!!errors.email}
            className={fieldCls(errors.email)}
          />
          {errors.email && <p role="alert" className="text-xs text-red-600 mt-1">{errors.email}</p>}
          <p className="text-xs text-gray-400 mt-1">We will send a verification code to this address after you submit.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guest-field-firstName" className="block text-sm font-medium text-gray-700 mb-1.5">First name {REQ}</label>
            <input id="guest-field-firstName" type="text" autoComplete="given-name" value={form.firstName} onChange={setField('firstName')} placeholder="Juan" maxLength={60} aria-required="true" aria-invalid={!!errors.firstName} className={fieldCls(errors.firstName)} />
            {errors.firstName && <p role="alert" className="text-xs text-red-600 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label htmlFor="guest-field-lastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last name {REQ}</label>
            <input id="guest-field-lastName" type="text" autoComplete="family-name" value={form.lastName} onChange={setField('lastName')} placeholder="Dela Cruz" maxLength={60} aria-required="true" aria-invalid={!!errors.lastName} className={fieldCls(errors.lastName)} />
            {errors.lastName && <p role="alert" className="text-xs text-red-600 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="guest-field-phoneDigits" className="block text-sm font-medium text-gray-700 mb-1.5">Mobile number {REQ}</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">+63</span>
            <input
              id="guest-field-phoneDigits"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={form.phoneDigits}
              onChange={(e) => { setForm((p) => ({ ...p, phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10) })); if (errors.phoneDigits) setErrors((p) => ({ ...p, phoneDigits: undefined })); }}
              placeholder="9171234567"
              aria-required="true"
              aria-invalid={!!errors.phoneDigits}
              className={`flex-1 rounded-r-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${errors.phoneDigits ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
          </div>
          {errors.phoneDigits && <p role="alert" className="text-xs text-red-600 mt-1">{errors.phoneDigits}</p>}
        </div>

        {/* ── Organization details ── */}
        <GuestSectionHeading>Organization details</GuestSectionHeading>

        <div>
          <label htmlFor="guest-field-name" className="block text-sm font-medium text-gray-700 mb-1.5">Organization name {REQ}</label>
          <input ref={nameRef} id="guest-field-name" type="text" value={form.name} onChange={setField('name')} placeholder="e.g. Acme Events Inc." maxLength={120} aria-required="true" aria-invalid={!!errors.name} className={fieldCls(errors.name)} />
          {errors.name && <p role="alert" className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="guest-field-description" className="block text-sm font-medium text-gray-700 mb-1.5">
            Description {REQ}
            <span className="ml-1.5 text-xs text-gray-400 font-normal">— what kind of events do you produce?</span>
          </label>
          <textarea id="guest-field-description" value={form.description} onChange={setField('description')} rows={3} maxLength={1000} placeholder="Describe your organization, the types of events you run, and your experience." aria-required="true" aria-invalid={!!errors.description} className={`${fieldCls(errors.description)} resize-none`} />
          <div className="flex justify-between mt-1">
            {errors.description ? <p role="alert" className="text-xs text-red-600">{errors.description}</p> : <span />}
            <span className={`text-xs ${form.description.length > 900 ? 'text-amber-600' : 'text-gray-400'}`}>{form.description.length}/1000</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guest-field-organizationType" className="block text-sm font-medium text-gray-700 mb-1.5">Organization type {REQ}</label>
            <select id="guest-field-organizationType" value={form.organizationType} onChange={setField('organizationType')} aria-required="true" aria-invalid={!!errors.organizationType} className={fieldCls(errors.organizationType)}>
              <option value="">Select type…</option>
              {ORG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.organizationType && <p role="alert" className="text-xs text-red-600 mt-1">{errors.organizationType}</p>}
          </div>
          <div>
            <label htmlFor="guest-field-registrationNumber" className="block text-sm font-medium text-gray-700 mb-1.5">DTI / SEC / CDA reg. no. <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
            <input id="guest-field-registrationNumber" type="text" value={form.registrationNumber} onChange={setField('registrationNumber')} placeholder="e.g. DTI-123456" maxLength={100} className={fieldCls()} />
          </div>
        </div>

        {/* ── Primary contact ── */}
        <GuestSectionHeading>Primary contact</GuestSectionHeading>

        <div>
          <label htmlFor="guest-field-contactName" className="block text-sm font-medium text-gray-700 mb-1.5">Contact person full name {REQ}</label>
          <input id="guest-field-contactName" type="text" value={form.contactName} onChange={setField('contactName')} placeholder="e.g. Juan Dela Cruz" maxLength={120} aria-required="true" aria-invalid={!!errors.contactName} className={fieldCls(errors.contactName)} />
          {errors.contactName && <p role="alert" className="text-xs text-red-600 mt-1">{errors.contactName}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guest-field-phone" className="block text-sm font-medium text-gray-700 mb-1.5">Contact phone {REQ}</label>
            <input id="guest-field-phone" type="tel" value={form.phone} onChange={setField('phone')} placeholder="+639171234567" maxLength={25} aria-required="true" aria-invalid={!!errors.phone} className={fieldCls(errors.phone)} />
            {errors.phone && <p role="alert" className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="guest-field-city" className="block text-sm font-medium text-gray-700 mb-1.5">City {REQ}</label>
            <input id="guest-field-city" type="text" value={form.city} onChange={setField('city')} placeholder="e.g. Davao City" maxLength={80} aria-required="true" aria-invalid={!!errors.city} className={fieldCls(errors.city)} />
            {errors.city && <p role="alert" className="text-xs text-red-600 mt-1">{errors.city}</p>}
          </div>
        </div>

        {/* ── Identity verification ── */}
        <GuestSectionHeading>Identity verification</GuestSectionHeading>
        <p className="text-xs text-gray-500 -mt-3">A valid Philippine government-issued ID is required for KYC verification.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guest-field-idType" className="block text-sm font-medium text-gray-700 mb-1.5">Government ID type {REQ}</label>
            <select id="guest-field-idType" value={form.idType} onChange={setField('idType')} aria-required="true" aria-invalid={!!errors.idType} className={fieldCls(errors.idType)}>
              <option value="">Select ID type…</option>
              {ID_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.idType && <p role="alert" className="text-xs text-red-600 mt-1">{errors.idType}</p>}
          </div>
          <div>
            <label htmlFor="guest-field-idNumber" className="block text-sm font-medium text-gray-700 mb-1.5">ID number {REQ}</label>
            <input id="guest-field-idNumber" type="text" value={form.idNumber} onChange={setField('idNumber')} placeholder="e.g. P1234567A" maxLength={50} aria-required="true" aria-invalid={!!errors.idNumber} className={fieldCls(errors.idNumber)} />
            {errors.idNumber && <p role="alert" className="text-xs text-red-600 mt-1">{errors.idNumber}</p>}
          </div>
        </div>

        {/* ── Online presence ── */}
        <GuestSectionHeading>Online presence <span className="normal-case font-normal text-gray-400">(optional)</span></GuestSectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guest-field-website" className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
            <input id="guest-field-website" type="url" value={form.website} onChange={setField('website')} placeholder="https://yourcompany.com" maxLength={200} aria-invalid={!!errors.website} className={fieldCls(errors.website)} />
            {errors.website && <p role="alert" className="text-xs text-red-600 mt-1">{errors.website}</p>}
          </div>
          <div>
            <label htmlFor="guest-field-facebookUrl" className="block text-sm font-medium text-gray-700 mb-1.5">Facebook page URL</label>
            <input id="guest-field-facebookUrl" type="url" value={form.facebookUrl} onChange={setField('facebookUrl')} placeholder="https://facebook.com/yourpage" maxLength={200} aria-invalid={!!errors.facebookUrl} className={fieldCls(errors.facebookUrl)} />
            {errors.facebookUrl && <p role="alert" className="text-xs text-red-600 mt-1">{errors.facebookUrl}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-violet-50 rounded-xl px-4 py-3">
          <svg className="flex-shrink-0 w-4 h-4 text-violet-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-violet-700 leading-relaxed">
            After submitting, we will send a verification code to your email. Enter it to confirm your identity and complete the application. Our team reviews all applications within 1–2 business days.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            disabled={submitting}
            className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-4 py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" role="status" aria-label="Submitting…">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </>
            ) : 'Submit application'}
          </button>
        </div>
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
      .catch(() => {
        // 404 = no org yet; any other error → still show the form
        setPageState({ kind: 'form' });
      });
  }, [isHydrating, isAuthenticated, user, router]);

  function handleRegistrationSuccess(org: OrgData) {
    setPageState({ kind: 'status', org });
  }

  function handleReapply() {
    if (pageState.kind === 'status') {
      setPageState({ kind: 'form', org: pageState.org });
    }
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
        return <UnauthenticatedLanding onApply={() => setPageState({ kind: 'guest-apply' })} />;
      case 'guest-apply':
        return <GuestApplicationFlow onSuccess={handleRegistrationSuccess} />;
      case 'form':
        return <RegistrationForm onSuccess={handleRegistrationSuccess} initialOrg={pageState.org} />;
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
    <main className="min-h-screen bg-gray-50 px-4 py-12 sm:py-16">
      {renderContent()}
    </main>
  );
}
