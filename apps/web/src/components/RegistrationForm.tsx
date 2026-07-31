'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPHP } from '@axon-tickets/utils';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { CreateRegistrationDto } from '@axon-tickets/types';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  birthday?: string | null;
  gender?: string | null;
  city?: string | null;
}

interface AttendeeFields {
  firstName: string;
  lastName: string;
  email: string;
  confirmEmail: string;
  phone: string;
  company: string;
  jobTitle: string;
  birthday: string;
  gender: string;
  city: string;
  raceDistance: string;
  raceDivision: string;
  genderIdentity: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  merchandiseSize: string;
  claimMethod: string;
  deliveryLine1: string;
  deliveryLine2: string;
  deliveryCity: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
}

const emptyAttendee = (): AttendeeFields => ({
  firstName: '',
  lastName: '',
  email: '',
  confirmEmail: '',
  phone: '',
  company: '',
  jobTitle: '',
  birthday: '',
  gender: '',
  city: '',
  raceDistance: '',
  raceDivision: '',
  genderIdentity: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  merchandiseSize: '',
  claimMethod: '',
  deliveryLine1: '',
  deliveryLine2: '',
  deliveryCity: '',
  deliveryProvince: '',
  deliveryPostalCode: '',
});

interface RunningConfig {
  distances?: Array<{ name: string; code: string }>;
  raceDivisions?: string[];
  genderIdentityOptions?: string[];
  merchandiseSizes?: string[];
  claimMethods?: Array<'self_claim' | 'delivery'>;
}

interface PaymentMethod {
  name: string;
  type?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
}

interface AgendaSubEventOption {
  id: string;
  title: string;
  time?: string;
}

interface GuestDuplicateConflict {
  email: string;
  attendeeName: string;
  transactionDate: string;
  referenceNumber: string;
}

interface Props {
  eventId: string;
  eventSlug: string;
  tierId: string;
  tierName: string;
  unitPrice: number;
  qty: number;
  /** Flat processing fee per registration transaction in pesos (defaults to 50). */
  platformFee?: number;
  paymentMethods?: PaymentMethod[] | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  paymentInstructions?: string | null;
  subEvents?: AgendaSubEventOption[];
  /** When set, form is in edit mode — PATCH existing registration instead of POST new. */
  registrationId?: string;
  /** Server-returned isFree for edit mode — used to decide post-submit routing. */
  initialIsFree?: boolean;
  /** Pre-filled attendee data for edit mode or post-OTP guest flow. */
  initialAttendees?: Array<Partial<AttendeeFields>>;
  /** Pre-filled notes for edit mode or post-OTP guest flow. */
  initialNotes?: string;
  eventType?: 'standard' | 'running';
  runningConfig?: RunningConfig | null;
  /** Scoped token for a consent-free guest registration. Never persisted outside sessionStorage. */
  guestAccessToken?: string;
  /** True when a guest used "I'm new here" but the email matched an existing verified account. */
  existingAccountDetected?: boolean;
  /** Paid checkout identity selected after payment proof. */
  checkoutMode?: 'authenticated' | 'guest' | 'account';
  onCheckoutStageChange?: (stage: 'details' | 'confirmation' | 'otp') => void;
}

export default function RegistrationForm({
  eventId,
  eventSlug,
  tierId,
  tierName,
  unitPrice,
  qty,
  platformFee = 50,
  paymentMethods,
  bankName,
  bankAccountName,
  bankAccountNumber,
  paymentInstructions,
  subEvents = [],
  registrationId,
  initialIsFree,
  initialAttendees,
  initialNotes,
  eventType = 'standard',
  runningConfig,
  guestAccessToken,
  existingAccountDetected = false,
  checkoutMode,
  onCheckoutStageChange,
}: Props) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const skipDetailsForAuthenticatedSingle = Boolean(
    registrationId && checkoutMode === 'authenticated' && qty === 1,
  );
  const [attendees, setAttendees] = useState<AttendeeFields[]>(() =>
    initialAttendees?.map((attendee) => ({
      ...emptyAttendee(),
      ...attendee,
      confirmEmail: attendee.confirmEmail ?? attendee.email ?? '',
    })) ?? Array.from({ length: qty }, emptyAttendee),
  );
  // Default ON unless we're in edit mode (initialAttendees already provides the data)
  const [useMyDetails, setUseMyDetails] = useState(Boolean(currentUser && !initialAttendees));
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [selectedSubEventIds, setSelectedSubEventIds] = useState<string[]>(() => subEvents.map((item) => item.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [checkingReferral, setCheckingReferral] = useState(false);
  const [checkoutStage, setCheckoutStage] = useState<'details' | 'confirmation' | 'otp'>(
    skipDetailsForAuthenticatedSingle ? 'confirmation' : 'details',
  );
  const [checkoutOtp, setCheckoutOtp] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [duplicateConflicts, setDuplicateConflicts] = useState<GuestDuplicateConflict[]>([]);
  const otpVerificationRef = useRef(false);
  // Synchronous guard — prevents duplicate submissions during the async gap
  // between the first click and React flushing the loading state update.
  const submittingRef = useRef(false);
  const subEventsInitializedRef = useRef(subEvents.length > 0);

  // Auto-fetch profile on mount when the toggle is ON (new registrations only)
  useEffect(() => {
    if (!initialAttendees && currentUser) {
      void handleToggleMyDetails(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotalPesos = unitPrice * qty;
  const feesPesos = Number(platformFee) || 0;
  const totalPesos = Math.max(0, subtotalPesos - referralDiscount) + feesPesos;
  const isFreeRegistration = unitPrice === 0 && feesPesos === 0;
  const isPaymentIntentStep = !registrationId && !isFreeRegistration;
  const promoCodesEnabled = false; // Release 2.0 is manual-payment proof only.
  const requiresSubEvent = !registrationId && subEvents.length > 0;
  const allSubEventsSelected = subEvents.length > 0 && selectedSubEventIds.length === subEvents.length;
  const isPaidCompletionFlow = Boolean(registrationId && checkoutMode && !isFreeRegistration);
  const confirmationReady = attendees.every((attendee) =>
    attendee.firstName.trim() && attendee.lastName.trim() && attendee.email.trim(),
  );

  const changeCheckoutStage = (stage: 'details' | 'confirmation' | 'otp') => {
    setCheckoutStage(stage);
    onCheckoutStageChange?.(stage);
    setError(null);
  };

  useEffect(() => {
    if (registrationId || subEvents.length === 0) return;
    setSelectedSubEventIds((current) => {
      const availableIds = subEvents.map((item) => item.id);
      if (!subEventsInitializedRef.current) {
        subEventsInitializedRef.current = true;
        return availableIds;
      }
      const next = current.filter((id) => availableIds.includes(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
  }, [registrationId, subEvents]);

  const updateAttendee = (index: number, field: keyof AttendeeFields, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleToggleMyDetails = async (enabled: boolean) => {
    setUseMyDetails(enabled);
    if (enabled) {
      let profile = profileData;
      if (!profile) {
        setProfileLoading(true);
        try {
          const res = await api.get<{ data: ProfileData }>('/users/me');
          profile = (res.data as unknown as { data: ProfileData }).data ?? (res.data as unknown as ProfileData);
          setProfileData(profile);
        } catch {
          // fall back to auth store values
        } finally {
          setProfileLoading(false);
        }
      }
      setAttendees((prev) => {
        const next = [...prev];
        next[0] = {
          ...emptyAttendee(),
          firstName: profile?.firstName ?? currentUser?.firstName ?? '',
          lastName: profile?.lastName ?? currentUser?.lastName ?? '',
          email: profile?.email ?? currentUser?.email ?? '',
          confirmEmail: profile?.email ?? currentUser?.email ?? '',
          phone: profile?.phone ?? '',
          company: profile?.company ?? '',
          jobTitle: profile?.jobTitle ?? '',
          birthday: profile?.birthday ? profile.birthday.slice(0, 10) : '',
          gender: profile?.gender ?? '',
          city: profile?.city ?? '',
        };
        return next;
      });
    } else {
      setAttendees((prev) => {
        const next = [...prev];
        next[0] = emptyAttendee();
        return next;
      });
    }
  };

  async function applyReferralCode() {
    if (!referralCode.trim()) {
      setReferralDiscount(0);
      setReferralMessage(null);
      return;
    }
    setCheckingReferral(true);
    try {
      const response = await api.post<{ data: { discount: number; name: string } }>('/registrations/validate-referral', {
        eventId,
        tierId,
        code: referralCode.trim(),
        attendeeCount: qty,
      });
      const result = response.data.data;
      setReferralDiscount(result.discount);
      setReferralCode(referralCode.trim().toUpperCase());
      setReferralMessage(`${result.name} applied — you save ${formatPHP(result.discount)}.`);
    } catch (err: any) {
      setReferralDiscount(0);
      setReferralMessage(null);
      const message = err?.response?.data?.message ?? 'Referral code could not be applied.';
      setReferralError(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      setCheckingReferral(false);
    }
  }

  const hasPaymentDetails =
    (paymentMethods && paymentMethods.length > 0) ||
    bankName ||
    bankAccountNumber ||
    paymentInstructions;

  const buildAttendeePayload = () => attendees.map((a) => ({
    firstName: a.firstName.trim(),
    lastName: a.lastName.trim(),
    email: a.email.trim().toLowerCase(),
    ...(a.phone.trim() && { phone: a.phone.trim() }),
    ...(a.company.trim() && { company: a.company.trim() }),
    ...(a.jobTitle.trim() && { jobTitle: a.jobTitle.trim() }),
    ...(a.birthday && { birthday: a.birthday }),
    ...(a.gender && { gender: a.gender as 'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'self_described' }),
    ...(a.city.trim() && { city: a.city.trim() }),
    ...(a.raceDistance && { raceDistance: a.raceDistance }),
    ...(a.raceDivision && { raceDivision: a.raceDivision }),
    ...(a.genderIdentity && { genderIdentity: a.genderIdentity }),
    ...(a.emergencyContactName.trim() && { emergencyContactName: a.emergencyContactName.trim() }),
    ...(a.emergencyContactPhone.trim() && { emergencyContactPhone: a.emergencyContactPhone.trim() }),
    ...(a.emergencyContactRelationship.trim() && { emergencyContactRelationship: a.emergencyContactRelationship.trim() }),
    ...(a.merchandiseSize && { merchandiseSize: a.merchandiseSize }),
    ...(a.claimMethod && { claimMethod: a.claimMethod as 'self_claim' | 'delivery' }),
    ...(a.claimMethod === 'delivery' && {
      deliveryAddress: {
        line1: a.deliveryLine1.trim(),
        ...(a.deliveryLine2.trim() && { line2: a.deliveryLine2.trim() }),
        city: a.deliveryCity.trim(),
        province: a.deliveryProvince.trim(),
        postalCode: a.deliveryPostalCode.trim(),
      },
    }),
  }));

  const attendeeUpdatePayload = () => ({
    attendees: buildAttendeePayload(),
    ...(notes.trim() && { notes: notes.trim() }),
  });

  async function syncAuthenticatedProfile() {
    if (!currentUser) return;
    const lead = attendees[0];
    const profilePatch = {
      firstName: lead.firstName.trim(),
      lastName: lead.lastName.trim(),
      phone: lead.phone.trim(),
      company: lead.company.trim(),
      jobTitle: lead.jobTitle.trim(),
      city: lead.city.trim(),
      ...(lead.birthday && { birthday: lead.birthday }),
      ...(lead.gender && { gender: lead.gender }),
    };
    try {
      await api.patch('/users/me', profilePatch);
    } catch {
      // The registration remains valid if an optional profile sync fails.
    }
  }

  async function confirmPaidCheckout() {
    if (!registrationId || !checkoutMode || !guestAccessToken && checkoutMode !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      if (checkoutMode === 'authenticated') {
        await api.patch(`/registrations/${registrationId}/attendees`, attendeeUpdatePayload());
        await syncAuthenticatedProfile();
        router.push(`/events/${eventSlug}/register/complete?registrationId=${registrationId}&scenario=authenticated`);
        return;
      }

      const leadEmail = attendees[0]?.email.trim().toLowerCase();
      if (checkoutMode === 'guest') {
        const duplicateResponse = await api.post<{ data?: { conflicts: GuestDuplicateConflict[] }; conflicts?: GuestDuplicateConflict[] }>(
          `/registrations/guest/${registrationId}/check-duplicates`,
          { emails: attendees.map((attendee) => attendee.email.trim().toLowerCase()) },
          { headers: { 'x-registration-token': guestAccessToken } },
        );
        const conflicts = duplicateResponse.data.data?.conflicts ?? duplicateResponse.data.conflicts ?? [];
        if (conflicts.length > 0) {
          setDuplicateConflicts(conflicts);
          return;
        }
        await api.post(
          `/registrations/guest/${registrationId}/request-confirmation-code`,
          { email: leadEmail },
          { headers: { 'x-registration-token': guestAccessToken } },
        );
      } else {
        const response = await api.post<{ data: { userId: string } }>('/auth/request-access', {
          email: leadEmail,
          eventId,
          eventSlug,
        });
        setPendingUserId(response.data.data.userId);
      }
      setCheckoutOtp('');
      changeCheckoutStage('otp');
    } catch (err: unknown) {
      const responseData = (err as { response?: { data?: { message?: string | string[]; conflicts?: GuestDuplicateConflict[] } } })?.response?.data;
      if (responseData?.conflicts?.length) setDuplicateConflicts(responseData.conflicts);
      const message =
        responseData?.message ??
        'We could not send the confirmation code.';
      setError(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyPaidCheckout() {
    if (
      !registrationId ||
      !checkoutMode ||
      checkoutMode === 'authenticated' ||
      checkoutOtp.length !== 6 ||
      !guestAccessToken ||
      otpVerificationRef.current
    ) return;
    otpVerificationRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const leadEmail = attendees[0].email.trim().toLowerCase();
      if (checkoutMode === 'guest') {
        const response = await api.post<{ data?: { referenceNumber?: string }; referenceNumber?: string }>(
          `/registrations/guest/${registrationId}/confirm`,
          { email: leadEmail, otp: checkoutOtp, ...attendeeUpdatePayload() },
          { headers: { 'x-registration-token': guestAccessToken } },
        );
        const referenceNumber = response.data.data?.referenceNumber ?? response.data.referenceNumber ?? '';
        router.push(`/events/${eventSlug}/register/complete?registrationId=${registrationId}&scenario=guest&reference=${encodeURIComponent(referenceNumber)}`);
        return;
      }

      const verification = await api.post<{
        data: {
          user: {
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            isAdmin: boolean;
            isOrganizer?: boolean;
            isVerified: boolean;
          };
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/verify-access', { userId: pendingUserId, otp: checkoutOtp, eventId, eventSlug });
      const { user, accessToken, refreshToken } = verification.data.data;
      setAuth(
        {
          id: user.id,
          email: user.email,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          isAdmin: user.isAdmin,
          isOrganizer: Boolean(user.isOrganizer),
          isVerified: user.isVerified,
          loginPortal: 'customer',
        },
        accessToken,
        refreshToken,
      );
      const completion = await api.patch<{ data?: { referenceNumber?: string }; referenceNumber?: string }>(
        `/registrations/${registrationId}/claim-and-complete`,
        attendeeUpdatePayload(),
        { headers: { 'x-registration-token': guestAccessToken } },
      );
      const referenceNumber = completion.data.data?.referenceNumber ?? completion.data.referenceNumber ?? '';
      window.sessionStorage.removeItem(`axon_guest_registration_${registrationId}`);
      router.push(`/events/${eventSlug}/register/complete?registrationId=${registrationId}&scenario=account&reference=${encodeURIComponent(referenceNumber)}`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ??
        'The code could not be verified.';
      setError(Array.isArray(message) ? message.join(' ') : message);
      setCheckoutOtp('');
      otpVerificationRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checkoutStage === 'otp' && checkoutOtp.length === 6) {
      void verifyPaidCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOtp, checkoutStage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous guard — blocks any duplicate event fired before React
    // has had a chance to re-render with loading=true.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      if (isPaymentIntentStep) {
        const payload: CreateRegistrationDto = {
          eventId,
          tierId,
          attendeeCount: qty,
          accountConsent: true,
        };
        const res = await api.post('/registrations', payload);
        const reg = res.data?.data ?? res.data;
        router.push(`/events/${eventSlug}/register/payment/${reg.id}`);
        return;
      }

      if (requiresSubEvent && selectedSubEventIds.length === 0) {
        setError('Please choose at least one sub-event to attend.');
        return;
      }

      const attendeePayload = buildAttendeePayload();

      const emailMismatch = checkoutMode === 'guest' ? undefined : attendees.find((attendee) =>
        attendee.email.trim().toLowerCase() !== attendee.confirmEmail.trim().toLowerCase(),
      );
      if (emailMismatch) {
        setError('Email and Confirm Email must match for every attendee.');
        return;
      }

      if (isPaidCompletionFlow && checkoutStage === 'details') {
        changeCheckoutStage('confirmation');
        return;
      }

      // Sync any edited profile fields back to the user's account
      if (useMyDetails && profileData && currentUser && !registrationId) {
        const a = attendees[0];
        const profilePatch: Record<string, string> = {};
        if (a.firstName.trim() && a.firstName.trim() !== profileData.firstName) profilePatch.firstName = a.firstName.trim();
        if (a.lastName.trim() && a.lastName.trim() !== profileData.lastName) profilePatch.lastName = a.lastName.trim();
        if (a.phone.trim() !== (profileData.phone ?? '')) profilePatch.phone = a.phone.trim();
        if (a.company.trim() !== (profileData.company ?? '')) profilePatch.company = a.company.trim();
        if (a.jobTitle.trim() !== (profileData.jobTitle ?? '')) profilePatch.jobTitle = a.jobTitle.trim();
        if (a.city.trim() && a.city.trim() !== (profileData.city ?? '')) profilePatch.city = a.city.trim();
        if (a.birthday && a.birthday !== (profileData.birthday?.slice(0, 10) ?? '')) profilePatch.birthday = a.birthday;
        if (a.gender && a.gender !== (profileData.gender ?? '')) profilePatch.gender = a.gender;
        if (Object.keys(profilePatch).length > 0) {
          try { await api.patch('/users/me', profilePatch); } catch { /* non-blocking */ }
        }
      }

      if (registrationId) {
        // Edit mode: update existing registration attendee details
        const attendeeUpdate = {
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
        };
        if (guestAccessToken) {
          await api.patch(`/registrations/guest/${registrationId}/attendees`, attendeeUpdate, {
            headers: { 'x-registration-token': guestAccessToken },
          });
          router.push(`/events/${eventSlug}/register/complete`);
        } else {
          await api.patch(`/registrations/${registrationId}/attendees`, attendeeUpdate);
          router.push(`/registrations/${registrationId}`);
        }
      } else {
        const payload: CreateRegistrationDto = {
          eventId,
          tierId,
          ...(selectedSubEventIds.length > 0 && { subEventIds: selectedSubEventIds }),
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
          ...(referralDiscount > 0 && referralCode.trim() && { referralCode: referralCode.trim() }),
        };
        const res = await api.post('/registrations', payload);
        const reg = res.data?.data ?? res.data;
        if (reg.isFree || reg.status === 'pending_approval') {
          router.push(`/registrations/${reg.id}`);
        } else {
          router.push(`/events/${eventSlug}/register/payment/${reg.id}`);
        }
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Please try again.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  if (isPaidCompletionFlow && checkoutStage === 'confirmation') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Payment & Proof</p>
          <h2 className="mt-1 font-semibold text-emerald-950">Proof uploaded successfully</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Review the complete order below. Nothing is finalized until you confirm.
          </p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Order Summary</h2>
          <div className="mt-3 flex justify-between text-sm text-gray-600">
            <span>{tierName} × {qty}</span>
            <span>{formatPHP(subtotalPesos)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-gray-600">
            <span>Service fee</span>
            <span>{formatPHP(feesPesos)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 font-semibold text-gray-900">
            <span>Total</span>
            <span className="text-primary">{formatPHP(totalPesos)}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{skipDetailsForAuthenticatedSingle ? 'Registrant Details' : 'Attendee Details'}</h2>
            {!skipDetailsForAuthenticatedSingle && (
              <button
                type="button"
                onClick={() => changeCheckoutStage('details')}
                className="min-h-[44px] text-sm font-semibold text-primary hover:underline"
              >
                Edit details
              </button>
            )}
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {attendees.map((attendee, index) => (
              <div key={`${attendee.email}-${index}`} className="py-3 text-sm">
                <p className="font-medium text-gray-900">
                  {index + 1}. {attendee.firstName} {attendee.lastName}
                </p>
                <p className="mt-0.5 text-gray-500">{attendee.email}{attendee.phone ? ` · ${attendee.phone}` : ''}</p>
                {eventType === 'running' && (
                  <p className="mt-0.5 text-gray-500">
                    {attendee.raceDistance} · {attendee.raceDivision} · {attendee.claimMethod.replace('_', ' ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          {notes.trim() && <p className="mt-3 text-sm text-gray-600"><span className="font-medium">Notes:</span> {notes}</p>}
        </section>

        {checkoutMode !== 'authenticated' && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-700">
            {checkoutMode === 'guest'
              ? 'After you confirm, Axon will send a one-time code to the lead attendee email. The code locks this transaction without creating an account.'
              : 'After you confirm, Axon will send a one-time code to the lead attendee email. Only after verification will the order be linked and the profile created or updated.'}
          </div>
        )}

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!confirmationReady && skipDetailsForAuthenticatedSingle && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Loading the registrant details from your verified profile…</div>
        )}

        {duplicateConflicts.length > 0 && (
          <div role="dialog" aria-modal="true" aria-labelledby="duplicate-title" className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d021c]/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">!</div>
              <h2 id="duplicate-title" className="mt-4 text-xl font-bold text-gray-900">Registration protected from duplicate purchases</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                This guest transaction is blocked because an attendee email already has an active registration for this event. This protection limits bulk purchasing by scalpers and keeps tickets available to more genuine attendees.
              </p>
              <div className="mt-4 space-y-2">
                {duplicateConflicts.map((conflict) => (
                  <div key={`${conflict.email}-${conflict.referenceNumber}`} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                    <p className="font-semibold text-gray-900">{conflict.attendeeName}</p>
                    <p>{new Date(conflict.transactionDate).toLocaleDateString('en-PH')} · Ref {conflict.referenceNumber}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">Details are partially masked until email ownership is verified.</p>
              <button type="button" onClick={() => setDuplicateConflicts([])} className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white">Return to attendee details</button>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={loading || !confirmationReady}
          onClick={() => void confirmPaidCheckout()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading
            ? checkoutMode === 'authenticated' ? 'Confirming transaction…' : 'Sending confirmation code…'
            : checkoutMode === 'authenticated' ? 'Confirm Transaction' : 'Confirm and Send My Code'}
        </button>
      </div>
    );
  }

  if (isPaidCompletionFlow && checkoutStage === 'otp') {
    return (
      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">Confirm your email</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter the 6-digit code sent to <span className="font-semibold text-gray-700">{attendees[0]?.email}</span>.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            The order is not locked until this code is verified.
          </p>
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          autoComplete="one-time-code"
          value={checkoutOtp}
          onChange={(event) => {
            otpVerificationRef.current = false;
            setCheckoutOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          disabled={loading}
          aria-label="Six-digit confirmation code"
          placeholder="000000"
          className="w-full rounded-xl border border-gray-300 px-4 py-4 text-center font-mono text-3xl tracking-[0.45em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />
        {loading && <p className="text-center text-sm text-gray-500">Verifying and locking your transaction…</p>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</div>}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => void confirmPaidCheckout()}
            className="min-h-[44px] text-sm font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setCheckoutOtp('');
              changeCheckoutStage('confirmation');
            }}
            className="min-h-[44px] text-sm text-gray-500 hover:text-gray-800"
          >
            ← Back to review
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
        <div className="flex justify-between text-sm text-gray-600">
          <span>
            {tierName} × {qty}
          </span>
          <span>{subtotalPesos === 0 ? 'Free' : formatPHP(subtotalPesos)}</span>
        </div>
        {!isFreeRegistration && (
          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>Service fee</span>
            <span>{formatPHP(feesPesos)}</span>
          </div>
        )}
        {referralDiscount > 0 && (
          <div className="flex justify-between text-sm font-medium text-emerald-700 mt-1">
            <span>Referral discount ({referralCode})</span>
            <span>−{formatPHP(referralDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 mt-3 pt-3 border-t border-gray-100">
          <span>Total</span>
          <span className="text-primary">{isFreeRegistration ? 'Free' : formatPHP(totalPesos)}</span>
        </div>
      </div>

      {!registrationId && promoCodesEnabled && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <label htmlFor="referral-code" className="block text-sm font-semibold text-gray-900">Have a referral code?</label>
          <p className="mt-1 text-xs text-gray-600">Apply it before confirming to preview your final total.</p>
          <div className="mt-3 flex gap-2">
            <input
              id="referral-code"
              value={referralCode}
              onChange={(event) => { setReferralCode(event.target.value.toUpperCase()); setReferralDiscount(0); setReferralMessage(null); setReferralError(null); setError(null); }}
              maxLength={32}
              autoComplete="off"
              placeholder="Enter code"
              className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-mono uppercase tracking-wide focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <button type="button" onClick={applyReferralCode} disabled={checkingReferral || !referralCode.trim()} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {checkingReferral ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {referralMessage && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">✓ {referralMessage}</p>}
          {referralError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">✗ {referralError}</p>}
        </div>
      )}

      {/* Group booking — single-receipt policy notice */}
      {qty > 1 && !isFreeRegistration && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-amber-600"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Group booking &mdash; 1 receipt for the full {formatPHP(totalPesos)}
            </p>
            <p className="mt-1 text-xs text-amber-700 leading-relaxed">
              You&apos;re registering <span className="font-semibold">{qty} attendees</span>. After
              confirming, transfer the total amount in a{' '}
              <span className="font-semibold">single transaction</span> and upload{' '}
              <span className="font-semibold">one receipt</span> as proof of payment. Multiple
              receipts per order will not be accepted.
            </p>
          </div>
        </div>
      )}

      {/* Payment details */}
      {hasPaymentDetails && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Payment Details</h2>
          <p className="text-xs text-gray-500 mb-3">
            Pay manually using one of the methods below. Submit your proof of payment after registering.
          </p>
          <div className="space-y-3">
            {paymentMethods?.map((m, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">{m.name}</span>
                  {m.type && (
                    <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {m.type}
                    </span>
                  )}
                </div>
                {m.accountName && (
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-medium">Account Name:</span> {m.accountName}
                  </div>
                )}
                {m.accountNumber && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account No.:</span> {m.accountNumber}
                  </div>
                )}
                {m.instructions && (
                  <div className="text-xs text-gray-500 mt-1">{m.instructions}</div>
                )}
              </div>
            ))}
            {(bankName || bankAccountNumber) && (
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                <div className="font-semibold text-sm text-gray-900">Bank Transfer</div>
                {bankName && (
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-medium">Bank:</span> {bankName}
                  </div>
                )}
                {bankAccountName && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account Name:</span> {bankAccountName}
                  </div>
                )}
                {bankAccountNumber && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account No.:</span> {bankAccountNumber}
                  </div>
                )}
              </div>
            )}
            {paymentInstructions && (
              <div className="text-xs text-gray-600 whitespace-pre-line">{paymentInstructions}</div>
            )}
          </div>
        </div>
      )}

      {!isPaymentIntentStep && (
        <>
      {/* Autofill toggle */}
      {currentUser && !guestAccessToken && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Use my account details for Attendee 1</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Pre-filled from your account ({currentUser.email}). Required fields highlighted in amber need your attention.
            </p>
          </div>
          <button
            type="button"
            disabled={profileLoading}
            onClick={() => handleToggleMyDetails(!useMyDetails)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              useMyDetails ? 'bg-primary' : 'bg-gray-200'
            } ${profileLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-pressed={useMyDetails}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                useMyDetails ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Existing-account notice — shown when the guest used "I'm new here" but the email
          already belonged to a verified account. Non-blocking: user can still review and proceed. */}
      {existingAccountDetected && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mt-0.5 h-5 w-5 shrink-0 text-blue-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-900">Account already exists</p>
            <p className="mt-0.5 text-sm text-blue-700">
              We found an existing account using these details. You may review or update your
              attendee information before continuing.
            </p>
          </div>
        </div>
      )}

      {/* Attendee forms */}
      {qty > 1 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
          <strong>Why we need each attendee’s details:</strong> every ticket receives its own named QR code. Enter the correct name and email for each recipient so their ticket and status updates reach the right person.
        </div>
      )}
      {attendees.map((att, i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 animate-fade-in-up"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          <h3 className="font-semibold text-gray-900">
            Attendee {i + 1}
            {i === 0 && (
              <span className="ml-2 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Lead Registrant
              </span>
            )}
          </h3>

          {(() => {
            // For Attendee 1 with toggle ON:
            // — field is empty → amber highlight so user knows it needs filling
            // — field has a value → normal editable (changes sync back to profile on submit)
            const auto = useMyDetails && i === 0;
            const missingCls = 'border-amber-400 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400';
            const normalCls = 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

            const cls = (val: string) =>
              !auto ? normalCls : val.trim() ? normalCls : missingCls;

            const MissingHint = () => (
              <p className="mt-1 text-[11px] text-amber-600 font-medium">
                ⚠ Missing from your profile — please fill this in
              </p>
            );

            if (checkoutMode === 'guest') {
              return (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      autoFocus={i === 0}
                      autoComplete={i === 0 ? 'email' : 'off'}
                      value={att.email}
                      onChange={(e) => {
                        updateAttendee(i, 'email', e.target.value);
                        updateAttendee(i, 'confirmEmail', e.target.value);
                      }}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}
                    />
                    {i === 0 && <p className="mt-1 text-[11px] text-gray-500">Used only for this transaction, review updates, and ticket delivery. No account or customer profile is created.</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                      <input required value={att.firstName} onChange={(e) => updateAttendee(i, 'firstName', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                      <input required value={att.lastName} onChange={(e) => updateAttendee(i, 'lastName', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                    </div>
                  </div>
                  {eventType === 'running' && (
                    <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                      <div>
                        <p className="text-sm font-semibold text-violet-950">Race-required details</p>
                        <p className="mt-1 text-xs leading-5 text-violet-800">These event-specific fields are needed for race assignment, safety, merchandise, and claiming. Axon does not use them to create a guest profile.</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-xs font-medium text-gray-700">Distance *<select required value={att.raceDistance} onChange={(e) => updateAttendee(i, 'raceDistance', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}><option value="">Select distance</option>{runningConfig?.distances?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                        <label className="text-xs font-medium text-gray-700">Race Division *<select required value={att.raceDivision} onChange={(e) => updateAttendee(i, 'raceDivision', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}><option value="">Select division</option>{runningConfig?.raceDivisions?.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        <label className="text-xs font-medium text-gray-700">Gender Identity <span className="font-normal text-gray-400">(optional)</span><select value={att.genderIdentity} onChange={(e) => updateAttendee(i, 'genderIdentity', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}><option value="">Prefer not to provide</option>{runningConfig?.genderIdentityOptions?.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        <label className="text-xs font-medium text-gray-700">Merchandise size *<select required value={att.merchandiseSize} onChange={(e) => updateAttendee(i, 'merchandiseSize', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}><option value="">Select size</option>{runningConfig?.merchandiseSizes?.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input required aria-label="Emergency contact name" placeholder="Emergency contact name" value={att.emergencyContactName} onChange={(e) => updateAttendee(i, 'emergencyContactName', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                        <input required type="tel" aria-label="Emergency contact phone" placeholder="Emergency contact phone" value={att.emergencyContactPhone} onChange={(e) => updateAttendee(i, 'emergencyContactPhone', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                        <input required aria-label="Emergency contact relationship" placeholder="Relationship" value={att.emergencyContactRelationship} onChange={(e) => updateAttendee(i, 'emergencyContactRelationship', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                      </div>
                      <label className="block text-xs font-medium text-gray-700">Claim method *<select required value={att.claimMethod} onChange={(e) => updateAttendee(i, 'claimMethod', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}><option value="">Select claim method</option>{runningConfig?.claimMethods?.includes('self_claim') && <option value="self_claim">Claim at event</option>}{runningConfig?.claimMethods?.includes('delivery') && <option value="delivery">Delivery</option>}</select></label>
                      {att.claimMethod === 'delivery' && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input required aria-label="Delivery address line 1" placeholder="Address line 1" value={att.deliveryLine1} onChange={(e) => updateAttendee(i, 'deliveryLine1', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm sm:col-span-2 ${normalCls}`} />
                          <input aria-label="Delivery address line 2" placeholder="Address line 2 (optional)" value={att.deliveryLine2} onChange={(e) => updateAttendee(i, 'deliveryLine2', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm sm:col-span-2 ${normalCls}`} />
                          <input required aria-label="Delivery city" placeholder="City" value={att.deliveryCity} onChange={(e) => updateAttendee(i, 'deliveryCity', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                          <input required aria-label="Delivery province" placeholder="Province" value={att.deliveryProvince} onChange={(e) => updateAttendee(i, 'deliveryProvince', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                          <input required aria-label="Delivery postal code" placeholder="Postal code" value={att.deliveryPostalCode} onChange={(e) => updateAttendee(i, 'deliveryPostalCode', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            }

            return (
              <>
                {i === 0 && checkoutMode === 'account' && (
                  <div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                        <input
                          type="email"
                          required
                          autoFocus
                          autoComplete="email"
                          value={att.email}
                          onChange={(e) => updateAttendee(i, 'email', e.target.value)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Email *</label>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          value={att.confirmEmail}
                          onChange={(e) => updateAttendee(i, 'confirmEmail', e.target.value)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">Axon checks and links this email only after you verify the final one-time code.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                    <input
                      required
                      value={att.firstName}
                      onChange={(e) => updateAttendee(i, 'firstName', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.firstName)}`}
                    />
                    {auto && !att.firstName.trim() && <MissingHint />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                    <input
                      required
                      value={att.lastName}
                      onChange={(e) => updateAttendee(i, 'lastName', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.lastName)}`}
                    />
                    {auto && !att.lastName.trim() && <MissingHint />}
                  </div>
                </div>

                {!(i === 0 && checkoutMode === 'account') && <div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={att.email}
                        onChange={(e) => updateAttendee(i, 'email', e.target.value)}
                        readOnly={auto}
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${auto ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : normalCls}`}
                      />
                      {auto && !att.email.trim() && <MissingHint />}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Email *</label>
                      <input
                        type="email"
                        required
                        value={att.confirmEmail}
                        onChange={(e) => updateAttendee(i, 'confirmEmail', e.target.value)}
                        readOnly={auto}
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${auto ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : normalCls}`}
                      />
                    </div>
                  </div>
                </div>}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={att.phone}
                      onChange={(e) => updateAttendee(i, 'phone', e.target.value)}
                      placeholder="+639171234567"
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.phone)}`}
                    />
                    {auto && !att.phone.trim() && <MissingHint />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                    <input
                      value={att.company}
                      onChange={(e) => updateAttendee(i, 'company', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.company)}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                  <input
                    value={att.jobTitle}
                    onChange={(e) => updateAttendee(i, 'jobTitle', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.jobTitle)}`}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Birthday <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="date" max={new Date().toISOString().slice(0, 10)} value={att.birthday} onChange={(e) => updateAttendee(i, 'birthday', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Gender <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select value={att.gender} onChange={(e) => updateAttendee(i, 'gender', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                      <option value="">Select</option>
                      <option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="self_described">Self-described</option><option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      City <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input value={att.city} onChange={(e) => updateAttendee(i, 'city', e.target.value)} placeholder="Davao City" className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                  </div>
                </div>

                {eventType === 'running' && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Race details</p>
                      <p className="text-xs text-gray-500">Race Division is used for results. Gender Identity is optional and stored separately.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-xs font-medium text-gray-600">
                        Distance *
                        <select required value={att.raceDistance} onChange={(e) => updateAttendee(i, 'raceDistance', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                          <option value="">Select distance</option>
                          {runningConfig?.distances?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        Race Division *
                        <select required value={att.raceDivision} onChange={(e) => updateAttendee(i, 'raceDivision', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                          <option value="">Select division</option>
                          {runningConfig?.raceDivisions?.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        Gender Identity <span className="font-normal text-gray-400">(optional)</span>
                        <select value={att.genderIdentity} onChange={(e) => updateAttendee(i, 'genderIdentity', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                          <option value="">Prefer not to provide</option>
                          {runningConfig?.genderIdentityOptions?.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        Merchandise size *
                        <select required value={att.merchandiseSize} onChange={(e) => updateAttendee(i, 'merchandiseSize', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                          <option value="">Select size</option>
                          {runningConfig?.merchandiseSizes?.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <input required aria-label="Emergency contact name" placeholder="Emergency contact name" value={att.emergencyContactName} onChange={(e) => updateAttendee(i, 'emergencyContactName', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                      <input required type="tel" aria-label="Emergency contact phone" placeholder="Emergency contact phone" value={att.emergencyContactPhone} onChange={(e) => updateAttendee(i, 'emergencyContactPhone', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                      <input required aria-label="Emergency contact relationship" placeholder="Relationship" value={att.emergencyContactRelationship} onChange={(e) => updateAttendee(i, 'emergencyContactRelationship', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                    </div>
                    <label className="block text-xs font-medium text-gray-600">
                      Claim method *
                      <select required value={att.claimMethod} onChange={(e) => updateAttendee(i, 'claimMethod', e.target.value)} className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                        <option value="">Select claim method</option>
                        {runningConfig?.claimMethods?.includes('self_claim') && <option value="self_claim">Claim at event</option>}
                        {runningConfig?.claimMethods?.includes('delivery') && <option value="delivery">Delivery (no logistics fee in Release 2.0)</option>}
                      </select>
                    </label>
                    {att.claimMethod === 'delivery' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input required aria-label="Delivery address line 1" placeholder="Address line 1" value={att.deliveryLine1} onChange={(e) => updateAttendee(i, 'deliveryLine1', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm sm:col-span-2 ${normalCls}`} />
                        <input aria-label="Delivery address line 2" placeholder="Address line 2 (optional)" value={att.deliveryLine2} onChange={(e) => updateAttendee(i, 'deliveryLine2', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm sm:col-span-2 ${normalCls}`} />
                        <input required aria-label="Delivery city" placeholder="City" value={att.deliveryCity} onChange={(e) => updateAttendee(i, 'deliveryCity', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                        <input required aria-label="Delivery province" placeholder="Province" value={att.deliveryProvince} onChange={(e) => updateAttendee(i, 'deliveryProvince', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                        <input required aria-label="Delivery postal code" placeholder="Postal code" value={att.deliveryPostalCode} onChange={(e) => updateAttendee(i, 'deliveryPostalCode', e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ))}

      {requiresSubEvent && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="block text-sm font-semibold text-gray-900">
                Sub-events <span className="text-red-500">*</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Select every sub-event this attendee will join.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={allSubEventsSelected}
                onChange={(e) => {
                  setSelectedSubEventIds(e.target.checked ? subEvents.map((item) => item.id) : []);
                  setError(null);
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Select all
            </label>
          </div>
          <div className="mt-4 grid gap-2">
            {subEvents.map((item) => {
              const checked = selectedSubEventIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    checked ? 'border-primary bg-primary/5 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedSubEventIds((current) => {
                        if (e.target.checked) return [...new Set([...current, item.id])];
                        return current.filter((id) => id !== item.id);
                      });
                      setError(null);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>{item.time ? `${item.time} - ${item.title}` : item.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {checkoutMode !== 'guest' && <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything we should know? e.g. food allergies, wheelchair access needed, etc."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>}
        </>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? 'Saving your spot…'
          : isPaymentIntentStep
            ? `Continue to payment — ${formatPHP(totalPesos)}`
            : registrationId
              ? isPaidCompletionFlow ? 'Review Transaction Details' : 'Submit attendee details for review'
              : `Confirm My Registration — ${isFreeRegistration ? 'Free' : formatPHP(totalPesos)}`}
      </button>
    </form>
  );
}
