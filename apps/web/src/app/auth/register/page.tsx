'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Button from '@/components/Button';

const GOOGLE_URL = `${(process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1')}/auth/google`;

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const captchaRef = useRef<HCaptcha>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneDigits: '',
  });
  const [captchaToken, setCaptchaToken] = useState('');

  function update(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function updatePhone(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, phoneDigits: digits }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      toast.error('Please complete the CAPTCHA');
      return;
    }
    setLoading(true);
    try {
      const phone = form.phoneDigits.length === 10 ? `+63${form.phoneDigits}` : undefined;
      const res = await api.post<{ data: { userId: string } }>('/auth/register', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        ...(phone && { phone }),
        captchaToken,
      });
      const userId = res.data.data.userId;
      toast.success('Account created! Check your email for a verification code.');
      router.push(`/auth/verify?email=${encodeURIComponent(form.email)}&userId=${userId}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Registration failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken('');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-bold text-primary">Axon Tickets</Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Register to attend upcoming events</p>
        </div>

        {/* ── Google — primary CTA ── */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mb-4 border border-gray-100">
          <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            ⚡ Quickest way to join
          </p>
          <a
            href={GOOGLE_URL}
            className="group flex items-center justify-between w-full rounded-xl border-2 border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-gray-800 hover:border-blue-400 hover:shadow-md transition-all duration-200"
          >
            <GoogleIcon />
            <span className="flex-1 text-center">Continue with Google</span>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
          <p className="mt-2.5 text-center text-xs text-gray-400">
            Instant setup — no password, no hassle
          </p>
        </div>

        {/* ── Divider ── */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-medium text-gray-400 whitespace-nowrap">or sign up with email</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Email form ── */}
        <form onSubmit={handleSubmit} autoComplete="off" className="bg-white shadow-sm rounded-2xl p-8 space-y-5 border border-gray-100">
          {/* Hidden honeypot inputs to deter autofill */}
          <input type="text" name="username_fake" style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />
          <input type="password" name="password_fake" style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                name="firstName"
                required
                autoComplete="given-name-new"
                value={form.firstName}
                onChange={update}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                name="lastName"
                required
                autoComplete="family-name-new"
                value={form.lastName}
                onChange={update}
                className={inputClass}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              value={form.email}
              onChange={update}
              className={inputClass}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={update}
              className={inputClass}
            />
          </div>

          {/* Phone — Philippines prefix */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile number <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
              <div className="flex items-center gap-1.5 bg-gray-50 border-r border-gray-300 px-3 py-2 select-none shrink-0">
                <span className="text-base leading-none">🇵🇭</span>
                <span className="text-sm font-medium text-gray-600">+63</span>
              </div>
              <input
                name="phoneDigits"
                type="tel"
                inputMode="numeric"
                placeholder="9XXXXXXXXX"
                maxLength={10}
                value={form.phoneDigits}
                onChange={updatePhone}
                autoComplete="off"
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none bg-white"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">Enter your 10-digit mobile number (e.g. 9171234567)</p>
          </div>

          <HCaptcha
            ref={captchaRef}
            sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001'}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken('')}
          />

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Create account
          </Button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

