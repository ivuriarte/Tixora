import type { InclusionSelection, RegistrationLineItem } from './inclusion.types';

export type RegistrationStatus =
  | 'pending_payment'
  | 'proof_submitted'
  | 'pending_approval'
  | 'verified'
  | 'rejected'
  | 'cancelled';

export interface RegistrationAttendee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  birthday: string | null;
  gender: string | null;
  city: string | null;
  subEventId?: string | null;
  subEventTitle?: string | null;
  subEventTime?: string | null;
  isLead: boolean;
  hasQr: boolean;
  checkedInAt: string | null;
}

export interface RegistrationProof {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  imageUrl?: string;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
}

export type ProofStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationEvent {
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  address: string | null;
  landmark: string | null;
  imageUrl: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  gcashNumber: string | null;
  paymentMethods?: Array<{
    name: string;
    type?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
    instructions?: string;
  }> | null;
}

export interface Registration {
  id: string;
  referenceNumber: string;
  status: RegistrationStatus;
  isFree: boolean;
  tierId: string | null;
  tierName: string | null;
  unitPrice: number | null;
  attendeeCount: number;
  subtotal: number;
  fees: number;
  total: number;
  discount: number;
  referralCode: string | null;
  currency: string;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  event: RegistrationEvent;
  attendees: RegistrationAttendee[];
  proofs: RegistrationProof[];
  lineItems?: RegistrationLineItem[];
  inclusionSubtotal?: number;
  inclusionHoldExpiresAt?: string | null;
}

export interface RegistrationSummary {
  id: string;
  referenceNumber: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  eventImageUrl: string | null;
  tierName: string | null;
  attendeeCount: number;
  total: number;
  currency: string;
  status: RegistrationStatus;
  isFree: boolean;
  createdAt: string;
  inclusionCount?: number;
  inclusionSubtotal?: number;
}

export interface CreateRegistrationDto {
  eventId: string;
  tierId: string;
  guestEmail?: string;
  subEventId?: string;
  subEventIds?: string[];
  attendees?: AttendeeInput[];
  attendeeCount?: number;
  accountConsent?: boolean;
  notes?: string;
  referralCode?: string;
  quoteToken?: string;
  inclusionSelections?: InclusionSelection[];
}

export interface AttendeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  birthday?: string;
  gender?: 'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'self_described';
  city?: string;
  raceDistance?: string;
  raceDivision?: string;
  genderIdentity?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  merchandiseSize?: string;
  claimMethod?: 'self_claim' | 'delivery';
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode: string;
  };
}
