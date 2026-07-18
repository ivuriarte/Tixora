'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Button from '@/components/Button';
import { Suspense } from 'react';

function friendlyOtpError(err: any): string {
  const raw = err?.response?.data?.message;
  const status = err?.response?.status;
  if (status === 429) return 'Too many attempts. Please wait a moment before trying again.';
  if (status === 410) return 'This code has expired. Please request a new one.';
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower.includes('invalid') || lower.includes('incorrect')) return 'That code is incorrect. Please check and try again.';
    if (lower.includes('expired')) return 'Your code has expired. Tap "Resend code" to get a new one.';
    if (lower.includes('already used')) return 'This code has already been used. Please request a new one.';
    if (lower.includes('not found') || lower.includes('user')) return 'We could not find your account. Please register again.';
  }
  return 'Something went wrong. Please try again or request a new code.';
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const userId = params.get('userId') ?? '';
  const { setAuth } = useAuthStore();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  // If userId is missing the link is broken — redirect back
  useEffect(() => {
    if (!userId) {
      toast.error('Verification link is invalid. Please register again.');
      router.replace('/auth/register');
    }
  }, [userId, router]);

  function handleOtpChange(index: number, value: string) {
    setInlineError('');
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setInlineError('Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setInlineError('');
    try {
      const res = await api.post<{ data: { user: any; accessToken: string; refreshToken: string } }>(
        '/auth/verify-email',
        { userId, otp: code },
      );
      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      toast.success('Email verified. Welcome to Axon Tickets!');
      router.push('/');
    } catch (err: any) {
      const msg = friendlyOtpError(err);
      setInlineError(msg);
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setInlineError('');
    try {
      await api.post('/auth/resend-otp', { userId });
      toast.success('A new code has been sent to your email.');
      setCooldown(60);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        toast.error('Please wait a minute before requesting another code.');
      } else {
        toast.error('Could not resend the code. Please try again shortly.');
      }
    } finally {
      setResending(false);
    }
  }

  if (!userId) return null;

  return (
    <div className="axon-auth-page">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="axon-label inline-flex min-h-[44px] items-center text-sm text-primary">Axon Tickets</Link>
          <h1 className="axon-display mt-4 text-4xl">Check your email</h1>
          <p className="mt-2 text-sm text-[#6b5b8a]">
            We sent a 6-digit code to{' '}
            <strong className="text-gray-700 break-all">{email || 'your email'}</strong>
          </p>
        </div>

        <form onSubmit={handleVerify} className="axon-auth-card space-y-6">
          {/* OTP inputs */}
          <div className="flex gap-2 justify-center">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
                className={`w-11 h-14 text-center text-xl font-semibold border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  inlineError
                    ? 'border-red-300 focus:ring-red-400 bg-red-50'
                    : 'border-gray-300 focus:ring-primary'
                }`}
              />
            ))}
          </div>

          {/* Inline error */}
          {inlineError && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span>{inlineError}</span>
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Verify email
          </Button>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">Didn&apos;t receive a code?</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="min-h-[44px] px-3 text-sm font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : resending
                ? 'Sending…'
                : 'Resend code'}
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs text-gray-400">
          Wrong email?{' '}
          <Link href="/auth/register" className="text-primary hover:underline">
            Start over
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
