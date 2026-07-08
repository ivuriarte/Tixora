import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MarketingHero from '@/components/marketing/MarketingHero';
import TrustSection from '@/components/marketing/TrustSection';
import Footer from '@/components/marketing/Footer';
import OrganizerCtaSection from '@/components/OrganizerCtaSection';
import { getSolutionCategory, solutionCategories } from '@/lib/solutions';

const organizerSteps = [
  'Create your event',
  'Share your event page',
  'Accept registrations or ticket purchases',
  'Validate attendees with QR check-in',
  'Track attendees and reports',
];

export function generateStaticParams() {
  return solutionCategories.map((c) => ({ category: c.slug }));
}

export function generateMetadata({ params }: { params: { category: string } }): Metadata {
  const category = getSolutionCategory(params.category);
  if (!category) return {};
  return {
    title: `${category.name} Ticketing & Registration — Axon Tickets`,
    description: category.metaDescription,
  };
}

export default function SolutionCategoryPage({ params }: { params: { category: string } }) {
  const category = getSolutionCategory(params.category);
  if (!category) notFound();

  return (
    <>
      <Navbar />
      <main className="bg-gray-50">
        <MarketingHero
          eyebrow={category.name}
          title={category.heroTitle}
          subtitle={category.heroSubtitle}
          primaryCta={{
            label: 'Create Your Event',
            href: '/become-organizer',
            dataTrack: `solutions-${category.slug}-create-event`,
          }}
          note="New organizers are approved in 1–2 business days."
        />
        <TrustSection heading="What you get" features={category.benefits} background="white" />
        <section className="bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">How it works for organizers</h2>
            <ol className="space-y-4 max-w-2xl">
              {organizerSteps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-gray-500 mt-8">
              Looking for events to attend instead?{' '}
              <Link href="/" className="text-primary font-medium hover:underline">
                Browse events
              </Link>
            </p>
          </div>
        </section>
        <OrganizerCtaSection
          heading={category.ctaHeading}
          buttonLabel="Create Your Event"
          dataTrack={`solutions-${category.slug}-cta`}
          hideWhenAuthenticated={false}
        />
      </main>
      <Footer />
    </>
  );
}
