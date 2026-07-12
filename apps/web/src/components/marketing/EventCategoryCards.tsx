import Link from 'next/link';
import { solutionCategories } from '@/lib/solutions';

export default function EventCategoryCards() {
  return (
    <section className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Built for every kind of event</h2>
          <p className="text-gray-500 mt-2">See how organizers use Axon Tickets for events like yours.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {solutionCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/solutions/${category.slug}`}
              className="group bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 group-hover:text-primary transition-colors mb-1">
                {category.name}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{category.cardLine}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
