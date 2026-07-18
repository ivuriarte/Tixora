'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import BirthdayPicker from '@/components/BirthdayPicker';
import toast from 'react-hot-toast';

function CompleteProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isHydrating } = useAuthStore();

  const rawReturnTo = searchParams.get('returnTo') ?? '';
  const returnTo = rawReturnTo.startsWith('/') ? rawReturnTo : '/account/tickets';

  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace(`/auth/access?redirect=${encodeURIComponent(`/account/complete-profile?returnTo=${returnTo}`)}`);
    }
  }, [isHydrating, isAuthenticated, router, returnTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/users/me', {
        birthday: birthday || undefined,
        gender: gender || undefined,
        city: city.trim() || undefined,
      });
      toast.success('Profile updated!');
      router.push(returnTo);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    router.push(returnTo);
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  if (isHydrating) return null;

  return (
    <div className="axon-auth-page">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="axon-display text-4xl">Profile details</h1>
          <p className="mt-2 text-sm text-[#6b5b8a]">
            Add optional details now, or skip and continue to your event.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="axon-auth-card space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Birthday <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <BirthdayPicker value={birthday} onChange={setBirthday} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={inputClass}
            >
              <option value="">Select</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="self_described">Self-described</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              placeholder="Davao City"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">
              Used for event demographics. Only accessible to authorised organizers and platform admins.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="axon-pill w-full gap-2 bg-primary text-sm text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              'Save and continue'
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={handleSkip}
          className="mt-4 min-h-[44px] w-full text-center text-sm font-medium text-[#756a92] transition-colors hover:text-primary"
        >
          Skip for now — I&apos;ll complete this later
        </button>
      </div>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense>
      <CompleteProfileForm />
    </Suspense>
  );
}
