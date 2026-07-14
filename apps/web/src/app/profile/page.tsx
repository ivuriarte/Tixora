'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { usePathname, useRouter } from 'next/navigation';

interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  birthday: string | null;
  gender: string | null;
  isVerified: boolean;
}

interface OrganizationProfile {
  name: string;
  description: string;
  approvalStatus: string;
  contactName: string;
  city: string;
  phone: string;
  idType: string;
  idNumber: string;
  organizationType: string;
  registrationNumber: string | null;
  website: string | null;
  facebookUrl: string | null;
}

const ORG_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual / Sole proprietor' },
  { value: 'company', label: 'Company / Corporation' },
  { value: 'ngo', label: 'Non-profit / NGO' },
  { value: 'event_company', label: 'Events company' },
];

const ID_TYPE_OPTIONS = [
  { value: 'passport', label: 'Philippine Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'umid', label: 'UMID' },
  { value: 'sss', label: 'SSS ID' },
  { value: 'philsys', label: 'PhilSys ID (National ID)' },
  { value: 'postal_id', label: 'Postal ID' },
];

const EMPTY_ORG_FORM = {
  name: '',
  description: '',
  organizationType: '',
  registrationNumber: '',
  contactName: '',
  phone: '',
  city: '',
  idType: '',
  idNumber: '',
  website: '',
  facebookUrl: '',
};

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isHydrating, user: authUser } = useAuthStore();
  const isAdminShell = pathname.startsWith('/admin');

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG_FORM);

  // Phone split: store the 10 digits after +63
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phoneDigits: '',
    company: '',
    jobTitle: '',
    city: '',
    birthday: '',
    gender: '',
  });

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace(isAdminShell ? '/auth/admin' : '/auth/access?redirect=/profile');
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
          birthday: p.birthday?.slice(0, 10) ?? '',
          gender: p.gender ?? '',
        });
        if (!authUser?.isAdmin && (authUser?.loginPortal === 'organizer' || authUser?.isOrganizer)) {
          api
            .get<{ data: OrganizationProfile }>('/organizations/me')
            .then((orgRes) => {
              const org = orgRes.data.data;
              setOrganization(org);
              setOrgForm({
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
              });
            })
            .catch(() => setOrganization(null));
        }
      })
      .catch(() => toast.error('Could not load your profile. Please refresh the page to try again.'))
      .finally(() => setLoading(false));
  }, [isHydrating, isAuthenticated, authUser?.isAdmin, authUser?.isOrganizer, authUser?.loginPortal, isAdminShell, router]);

  function update(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function updatePhone(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, phoneDigits: digits }));
  }

  function updateOrg(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setOrgForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.phoneDigits.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/users/me', {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: `+63${form.phoneDigits}`,
        company: form.company.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        city: form.city.trim() || undefined,
        birthday: form.birthday || undefined,
        gender: form.gender || undefined,
      });
      toast.success('Profile updated!');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleOrgSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgForm.name.trim() || orgForm.name.trim().length < 2) {
      toast.error('Organization name must be at least 2 characters.');
      return;
    }
    if (!orgForm.description.trim() || orgForm.description.trim().length < 20) {
      toast.error('Description must be at least 20 characters.');
      return;
    }
    if (!orgForm.organizationType || !orgForm.contactName.trim() || !orgForm.phone.trim() || !orgForm.city.trim() || !orgForm.idType || !orgForm.idNumber.trim()) {
      toast.error('Please complete all required organizer account fields.');
      return;
    }
    if (!/^\+?[0-9\s\-().]{7,25}$/.test(orgForm.phone.trim())) {
      toast.error('Please enter a valid organizer contact phone number.');
      return;
    }
    setOrgSaving(true);
    try {
      const payload = {
        name: orgForm.name.trim(),
        description: orgForm.description.trim(),
        organizationType: orgForm.organizationType,
        registrationNumber: orgForm.registrationNumber.trim() || null,
        contactName: orgForm.contactName.trim(),
        phone: orgForm.phone.trim(),
        city: orgForm.city.trim(),
        idType: orgForm.idType,
        idNumber: orgForm.idNumber.trim(),
        website: orgForm.website.trim() || null,
        facebookUrl: orgForm.facebookUrl.trim() || null,
      };
      const res = await api.patch<{ data: OrganizationProfile }>('/organizations/me', payload);
      const org = res.data.data;
      setOrganization(org);
      setOrgForm({
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
      });
      toast.success('Organizer account updated!');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save organizer account.');
    } finally {
      setOrgSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  if (isHydrating || loading) {
    return (
      <>
        {!isAdminShell && <Navbar />}
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
  const isOrganizerPortal = !authUser?.isAdmin && (authUser?.loginPortal === 'organizer' || authUser?.isOrganizer);
  const accountLabel = authUser?.isAdmin ? 'Platform Admin' : isOrganizerPortal ? 'Organizer' : 'Customer';
  const detailTitle = authUser?.isAdmin
    ? 'Admin Details'
    : isOrganizerPortal
      ? 'Organizer Contact Details'
      : 'Professional Details';
  const detailHelp = authUser?.isAdmin
    ? 'Used for internal admin identification, audit trails, and support handoffs.'
    : isOrganizerPortal
      ? 'Used for organizer support, event operations, and workspace coordination.'
      : 'Used on conference registrations and event name badges.';

  return (
    <>
      {!isAdminShell && <Navbar />}
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{accountLabel} Profile</h1>

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
            <span className="inline-flex items-center gap-1 mt-1 ml-2 text-xs text-primary font-medium">
              {accountLabel}
            </span>
          </div>
        </div>

        {organization && isOrganizerPortal && (
          <form onSubmit={handleOrgSave} className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-5 mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Organizer Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization <span className="text-red-500">*</span></label>
                <input name="name" value={orgForm.name} onChange={updateOrg} required className={inputClass} />
              </div>
              <div>
                <p className="text-gray-400">KYC status</p>
                <p className="font-medium text-gray-900 capitalize">{organization.approvalStatus}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization type <span className="text-red-500">*</span></label>
                <select name="organizationType" value={orgForm.organizationType} onChange={updateOrg} required className={inputClass}>
                  <option value="">Select type...</option>
                  {ORG_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary contact <span className="text-red-500">*</span></label>
                <input name="contactName" value={orgForm.contactName} onChange={updateOrg} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact phone <span className="text-red-500">*</span></label>
                <input name="phone" value={orgForm.phone} onChange={updateOrg} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organizer city <span className="text-red-500">*</span></label>
                <input name="city" value={orgForm.city} onChange={updateOrg} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Government ID type <span className="text-red-500">*</span></label>
                <select name="idType" value={orgForm.idType} onChange={updateOrg} required className={inputClass}>
                  <option value="">Select ID type...</option>
                  {ID_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID number <span className="text-red-500">*</span></label>
                <input name="idNumber" value={orgForm.idNumber} onChange={updateOrg} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration no. <span className="text-gray-400 font-normal">(optional)</span></label>
                <input name="registrationNumber" value={orgForm.registrationNumber} onChange={updateOrg} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                <input name="website" value={orgForm.website} onChange={updateOrg} placeholder="https://yourcompany.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook page <span className="text-gray-400 font-normal">(optional)</span></label>
                <input name="facebookUrl" value={orgForm.facebookUrl} onChange={updateOrg} placeholder="https://facebook.com/yourpage" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea name="description" value={orgForm.description} onChange={updateOrg} required rows={4} className={`${inputClass} resize-none`} />
              </div>
            </div>
            <button
              type="submit"
              disabled={orgSaving}
              className="w-full bg-primary text-white font-semibold py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {orgSaving ? 'Saving...' : 'Save organizer account'}
            </button>
          </form>
        )}

        {!isOrganizerPortal && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Basic Info</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name <span className="text-red-500">*</span></label>
                <input name="firstName" value={form.firstName} onChange={update} autoComplete="given-name" required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name <span className="text-red-500">*</span></label>
                <input name="lastName" value={form.lastName} onChange={update} autoComplete="family-name" required className={inputClass} />
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
                Mobile number <span className="text-red-500">*</span>
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
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">{detailTitle}</h2>
              <p className="text-xs text-gray-400 mt-1">{detailHelp}</p>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Birthday <span className="text-gray-400 font-normal">(optional)</span></label><input name="birthday" type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={update} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-gray-400 font-normal">(optional)</span></label><select name="gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className={inputClass}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="self_described">Self-described</option><option value="prefer_not_to_say">Prefer not to say</option></select></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Birthday <span className="text-gray-400 font-normal">(optional)</span></label><input name="birthday" type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={update} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-gray-400 font-normal">(optional)</span></label><select name="gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className={inputClass}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="self_described">Self-described</option><option value="prefer_not_to_say">Prefer not to say</option></select></div>
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
        )}
      </main>
    </>
  );
}
