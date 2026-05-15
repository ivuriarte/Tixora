'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Button from '@/components/Button';

export default function RegisterPage() {
  const router = useRouter();
  const captchaRef = useRef<HCaptcha>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [captchaToken, setCaptchaToken] = useState('');

  function update(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      toast.error('Please complete the CAPTCHA');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', { ...form, captchaToken });
      toast.success('Account created! Check your email for a verification code.');
      router.push(`/auth/verify?email=${encodeURIComponent(form.email)}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Registration failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">Axon Tickets</Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Buy tickets to the best events in PH</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-2xl p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                name="firstName"
                required
                value={form.firstName}
                onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                name="lastName"
                required
                value={form.lastName}
                onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={update}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={update}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile number <span className="text-gray-400">(optional)</span>
            </label>
            <input
              name="phone"
              type="tel"
              placeholder="+639XXXXXXXXX"
              value={form.phone}
              onChange={update}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
