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
    alternates: { canonical: `/solutions/${category.slug}` },
    openGraph: {
      title: `${category.name} Ticketing & Registration — Axon Tickets`,
      description: category.metaDescription,
      url: `/solutions/${category.slug}`,
    },
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
          <div className="page-container py-14 md:py-20">
            <h2 className="axon-display mb-8 text-3xl md:text-5xl">How it works for organizers</h2>
            <ol className="space-y-4 max-w-2xl">
              {organizerSteps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-sm font-bold text-primary" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[#4f416c]">{step}</span>
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
