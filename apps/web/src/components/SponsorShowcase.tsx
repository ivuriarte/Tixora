interface Sponsor {
  name: string;
  logoUrl?: string;
  tier?: string;
  websiteUrl?: string;
  description?: string;
}

const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze', 'partner', 'media partner', 'community partner'];

export default function SponsorShowcase({
  sponsors,
  compact = false,
}: {
  sponsors: Sponsor[];
  compact?: boolean;
}) {
  if (!sponsors.length) return null;
  const grouped = sponsors.reduce<Record<string, Sponsor[]>>((result, sponsor) => {
    const key = sponsor.tier?.trim().toLowerCase() || 'partners';
    (result[key] ??= []).push(sponsor);
    return result;
  }, {});
  const tiers = Object.keys(grouped).sort((left, right) => {
    const leftIndex = TIER_ORDER.indexOf(left);
    const rightIndex = TIER_ORDER.indexOf(right);
    return (leftIndex < 0 ? TIER_ORDER.length : leftIndex) - (rightIndex < 0 ? TIER_ORDER.length : rightIndex)
      || left.localeCompare(right);
  });

  return (
    <section className={`rounded-2xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/50 ${compact ? 'p-4' : 'p-5'}`} aria-labelledby="sponsor-title">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">With support from</p>
        <h2 id="sponsor-title" className="mt-1 text-base font-semibold text-gray-900">Sponsors &amp; Partners</h2>
      </div>
      <div className="space-y-5">
        {tiers.map((tier) => (
          <div key={tier}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {tier === 'partners' ? 'Partners' : tier}
            </p>
            <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-2.5`}>
              {grouped[tier].map((sponsor, index) => {
                const content = (
                  <div className="flex min-h-20 items-center justify-center rounded-xl border border-violet-100 bg-white p-3 shadow-sm transition-transform hover:-translate-y-0.5">
                    {sponsor.logoUrl ? (
                      // Organizer-provided external asset. Full color is intentional.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sponsor.logoUrl} alt={`${sponsor.name} logo`} loading="lazy" decoding="async" className="max-h-12 w-auto max-w-full object-contain opacity-100" />
                    ) : (
                      <span className="text-center text-xs font-semibold text-gray-700">{sponsor.name}</span>
                    )}
                  </div>
                );
                return sponsor.websiteUrl ? (
                  <a key={`${sponsor.name}-${index}`} href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${sponsor.name}`} title={sponsor.description || sponsor.name}>
                    {content}
                  </a>
                ) : <div key={`${sponsor.name}-${index}`} title={sponsor.description || sponsor.name}>{content}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
