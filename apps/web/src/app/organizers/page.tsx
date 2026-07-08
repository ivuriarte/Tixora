import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import MarketingHero from '@/components/marketing/MarketingHero';
import OrganizerPainPoints from '@/components/marketing/OrganizerPainPoints';
import TrustSection from '@/components/marketing/TrustSection';
import UseCaseCards from '@/components/marketing/UseCaseCards';
import Footer from '@/components/marketing/Footer';
import OrganizerCtaSection from '@/components/OrganizerCtaSection';
import { iconPaths } from '@/components/marketing/icons';

export const metadata: Metadata = {
  title: 'For Event Organizers — Axon Tickets',
  description:
    'Create and manage events with Axon Tickets. Built for organizers who need ticketing, registration, QR check-in, attendee records, and event reports.',
  alternates: { canonical: '/organizers' },
  openGraph: {
    title: 'For Event Organizers — Axon Tickets',
    description:
      'Create event pages, manage registrations, send QR tickets, validate attendance, and track event data with Axon Tickets.',
    url: '/organizers',
  },
};

const solutionFeatures = [
  { title: 'Branded public event pages', description: 'A professional page for your event with your details, agenda, and sponsors.', iconPath: iconPaths.eventPage },
  { title: 'Online registration', description: 'Attendees register from any device — no more forms and spreadsheets to reconcile.', iconPath: iconPaths.registration },
  { title: 'QR code ticketing', description: 'Every confirmed attendee gets a unique QR ticket delivered by email.', iconPath: iconPaths.ticket },
  { title: 'Automatic confirmation emails', description: 'Confirmations go out on their own the moment a registration is approved.', iconPath: iconPaths.email },
  { title: 'Attendee list management', description: 'One live list of everyone who registered, with their verified details.', iconPath: iconPaths.attendees },
  { title: 'QR check-in validation', description: 'Scan tickets at the door from any phone and catch invalid or reused codes.', iconPath: iconPaths.checkin },
  { title: 'Reports and exports', description: 'Track registrations and attendance, and export your data when you need it.', iconPath: iconPaths.reports },
];

const whyBullets = [
  'Built around Philippine event workflows — GCash-friendly payment proof collection and local phone formats',
  'Simple organizer experience — once approved, publishing an event takes minutes',
  'Attendee-friendly registration with OTP email verification',
  'QR-based validation at the door',
  'A foundation that grows with your events',
];

export default function OrganizersPage() {
  return (
    <>
      <Navbar />
      <main className="bg-gray-50">
        <MarketingHero
          eyebrow="For Organizers"
          title="Sell tickets, manage attendees, and run better events with Axon Tickets."
          subtitle="Axon Tickets gives organizers the tools to create event pages, manage registrations, send QR codes, validate attendance, and track event data in one platform."
          primaryCta={{ label: 'Create Your Event', href: '/become-organizer', dataTrack: 'organizer-create-event' }}
          secondaryCta={{
            label: 'Talk to Us on Facebook',
            href: 'https://www.facebook.com/axonentertainment.ph',
            dataTrack: 'organizer-contact-facebook',
            external: true,
          }}
          note="New organizers are approved in 1–2 business days."
        />
        <OrganizerPainPoints />
        <TrustSection
          heading="One platform for the whole event"
          subheading="Everything the spreadsheet stack was doing — in one place."
          features={solutionFeatures}
          background="gray"
        />
        <UseCaseCards />
        <section className="bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Why organizers choose Axon Tickets</h2>
            <ul className="space-y-4 max-w-2xl">
              {whyBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-gray-700">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <OrganizerCtaSection
          heading="Launch your next event with Axon Tickets."
          buttonLabel="Create Your Event"
          dataTrack="organizer-create-event-footer"
          hideWhenAuthenticated={false}
        />
      </main>
      <Footer />
    </>
  );
}
