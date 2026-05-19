'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  isVerified: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, user: authUser } = useAuthStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Phone split: store the 10 digits after +63
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phoneDigits: '',
    company: '',
    jobTitle: '',
    city: '',
  });

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace('/auth/login?redirect=/profile');
      return;
    }
    api
      .get<{ data: ProfileData }>('/users/me')
      .then((res) => {
        const p = res.data.data;
        setProfile(p);
        // phone is stored as +639XXXXXXXXX → extract the 10 digits after +63
        const digits = p.phone?.startsWith('+63') ? p.phone.slice(3) : '';
        setForm({
          firstName: p.firstName,
          lastName: p.lastName,
          phoneDigits: digits,
          company: p.company ?? '',
          jobTitle: p.jobTitle ?? '',
          city: p.city ?? '',
        });
      })
      .catch(() => toast.error('Could not load profile.'))
      .finally(() => setLoading(false));
  }, [isHydrating, isAuthenticated, router]);

  function update(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function updatePhone(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, phoneDigits: digits }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const phone = form.phoneDigits.length === 10 ? `+63${form.phoneDigits}` : form.phoneDigits.length === 0 ? '' : undefined;
      await api.patch('/users/me', {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: phone ?? undefined,
        company: form.company.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        city: form.city.trim() || undefined,
      });
      toast.success('Profile updated!');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  if (isHydrating || loading) {
    return (
      <>
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-10 space-y-4">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        </main>
      </>
    );
  }

  const initials = profile
    ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

        {/* Avatar + email header */}
        <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-5 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {form.firstName} {form.lastName}
            </p>
            <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
            {profile?.isVerified && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-green-600 font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Basic Info</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                <input name="firstName" value={form.firstName} onChange={update} autoComplete="given-name" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                <input name="lastName" value={form.lastName} onChange={update} autoComplete="family-name" className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                value={profile?.email ?? ''}
                readOnly
                disabled
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed here.</p>
            </div>

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
                  type="tel"
                  inputMode="numeric"
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                  value={form.phoneDigits}
                  onChange={updatePhone}
                  autoComplete="tel-national"
                  className="flex-1 min-w-0 px-3 py-2 text-sm outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Professional Details */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Professional Details</h2>
              <p className="text-xs text-gray-400 mt-1">Used on conference registrations and event name badges.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company / Organization <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input name="company" value={form.company} onChange={update} placeholder="Acme Corp" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job title / Position <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input name="jobTitle" value={form.jobTitle} onChange={update} placeholder="General Manager" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input name="city" value={form.city} onChange={update} placeholder="Davao City" className={inputClass} />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white font-semibold py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </main>
    </>
  );
}
