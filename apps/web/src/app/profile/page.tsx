'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';

// Password change modal component
function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSave = newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await api.patch('/users/me/password', { newPassword });
      toast.success('Password changed!');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setError('');
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Change Password">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm pr-10 ${error && newPassword !== confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showNew ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary"
              onClick={() => setShowNew(v => !v)}
            >
              {showNew ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-9 0-1.657.403-3.22 1.125-4.575M6.7 6.7A9.956 9.956 0 0112 5c5 0 9 4 9 9 0 1.657-.403 3.22-1.125 4.575M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.37 1.144-.958 2.206-1.72 3.104M15.54 15.54A5.978 5.978 0 0112 17c-3.314 0-6-2.686-6-6 0-.795.155-1.552.44-2.24" /></svg>
              )}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm pr-10 ${error || (confirmPassword && newPassword !== confirmPassword) ? 'border-red-500' : 'border-gray-300'}`}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary"
              onClick={() => setShowConfirm(v => !v)}
            >
              {showConfirm ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-9 0-1.657.403-3.22 1.125-4.575M6.7 6.7A9.956 9.956 0 0112 5c5 0 9 4 9 9 0 1.657-.403 3.22-1.125 4.575M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.37 1.144-.958 2.206-1.72 3.104M15.54 15.54A5.978 5.978 0 0112 17c-3.314 0-6-2.686-6-6 0-.795.155-1.552.44-2.24" /></svg>
              )}
            </button>
          </div>
          {newPassword.length > 0 && newPassword.length < 8 && (
            <p className="text-xs text-amber-500 mt-1">Password must be at least 8 characters.</p>
          )}
          {(confirmPassword && newPassword !== confirmPassword) && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
          )}
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white font-semibold disabled:opacity-60" disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
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

  const [changePwOpen, setChangePwOpen] = useState(false);
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
      router.replace('/auth/access?redirect=/profile');
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

        {/* Password section */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Password</h2>
          <div className="flex items-center gap-4">
            <input
              type="password"
              value="password-placeholder"
              readOnly
              className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              tabIndex={-1}
              aria-label="Current password (hidden)"
            />
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
              onClick={() => setChangePwOpen(true)}
            >
              Change Password
            </button>
          </div>
        </div>

        <ChangePasswordModal open={changePwOpen} onClose={() => setChangePwOpen(false)} />

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
