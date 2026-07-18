import Link from 'next/link';
import { solutionCategories } from '@/lib/solutions';

export default function EventCategoryCards() {
  return (
    <section className="bg-gray-50">
      <div className="page-container py-14 md:py-20">
        <div className="max-w-2xl mb-10">
          <h2 className="axon-display text-3xl md:text-5xl">Built for every kind of event</h2>
          <p className="mt-3 text-[#6b5b8a]">See how organizers use Axon Tickets for events like yours.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {solutionCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/solutions/${category.slug}`}
              className="group min-h-[132px] rounded-lg border border-[#e4dcf4] bg-white p-5 transition-colors hover:border-primary sm:p-6"
            >
              <h3 className="axon-label mb-2 text-xs text-[#1a0533] transition-colors group-hover:text-primary sm:text-sm">
                {category.name}
              </h3>
              <p className="text-xs leading-relaxed text-[#6b5b8a] sm:text-sm">{category.cardLine}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
