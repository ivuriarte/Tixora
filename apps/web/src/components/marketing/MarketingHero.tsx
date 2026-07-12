import Link from 'next/link';

interface HeroCta {
  label: string;
  href: string;
  dataTrack: string;
  external?: boolean;
}

interface MarketingHeroProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  primaryCta: HeroCta;
  secondaryCta?: HeroCta;
  note?: string;
}

const primaryClasses =
  'inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-primary text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const secondaryClasses =
  'inline-flex items-center justify-center gap-2 w-full sm:w-auto border border-gray-300 text-gray-800 font-semibold px-8 py-3.5 rounded-xl text-base hover:border-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function CtaLink({ cta, variant }: { cta: HeroCta; variant: 'primary' | 'secondary' }) {
  const className = variant === 'primary' ? primaryClasses : secondaryClasses;
  if (cta.external) {
    return (
      <a href={cta.href} target="_blank" rel="noopener noreferrer" data-track={cta.dataTrack} className={className}>
        {cta.label}
        <span className="sr-only">(opens in new tab)</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    );
  }
  return (
    <Link href={cta.href} data-track={cta.dataTrack} className={className}>
      {cta.label}
    </Link>
  );
}

export default function MarketingHero({ eyebrow, title, subtitle, primaryCta, secondaryCta, note }: MarketingHeroProps) {
  return (
    <section className="bg-gradient-to-b from-primary-50 to-gray-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
        {eyebrow && (
          <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide uppercase">
            {eyebrow}
          </span>
        )}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight max-w-3xl mx-auto mb-5">
          {title}
        </h1>
        <p className="text-gray-600 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <CtaLink cta={primaryCta} variant="primary" />
          {secondaryCta && <CtaLink cta={secondaryCta} variant="secondary" />}
        </div>
        {note && <p className="text-sm text-gray-500 mt-4">{note}</p>}
      </div>
    </section>
  );
}
