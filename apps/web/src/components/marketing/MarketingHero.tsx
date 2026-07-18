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
  'axon-pill w-full gap-2 bg-primary text-sm text-white hover:bg-primary-hover sm:w-auto';
const secondaryClasses =
  'axon-pill w-full gap-2 border border-[#a78bfa] text-sm text-white hover:bg-white/10 sm:w-auto';

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
    <section className="border-b border-[#3b0764] bg-[#1a0533] text-white">
      <div className="page-container py-16 text-center md:py-24">
        {eyebrow && (
          <span className="mb-5 inline-flex min-h-[32px] items-center rounded-full bg-white/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#a78bfa]">
            {eyebrow}
          </span>
        )}
        <h1 className="axon-display mx-auto mb-5 max-w-4xl text-4xl sm:text-6xl md:text-7xl">
          {title}
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-[#c4b5fd] sm:text-lg">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <CtaLink cta={primaryCta} variant="primary" />
          {secondaryCta && <CtaLink cta={secondaryCta} variant="secondary" />}
        </div>
        {note && <p className="mt-4 text-sm text-[#a78bfa]">{note}</p>}
      </div>
    </section>
  );
}
