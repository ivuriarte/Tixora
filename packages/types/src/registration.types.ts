export type RegistrationStatus =
  | 'pending_payment'
  | 'proof_submitted'
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
    instructions?: string;
  }> | null;
}

export interface Registration {
  id: string;
  referenceNumber: string;
  status: RegistrationStatus;
  tierName: string | null;
  unitPrice: number | null;
  attendeeCount: number;
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  event: RegistrationEvent;
  attendees: RegistrationAttendee[];
  proofs: RegistrationProof[];
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
  createdAt: string;
}

export interface CreateRegistrationDto {
  eventId: string;
  tierId: string;
  attendees: AttendeeInput[];
  notes?: string;
}

export interface AttendeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
}
