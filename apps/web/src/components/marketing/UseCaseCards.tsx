import Link from 'next/link';

const useCases = [
  { label: 'Conferences', line: 'Tiered tickets, agendas, and delegate check-in', href: '/solutions/conferences' },
  { label: 'Fun runs', line: 'Online sign-ups and QR validation on race day', href: '/solutions/fun-runs' },
  { label: 'Corporate seminars', line: 'Branded pages with attendee records and exports', href: '/solutions/corporate-events' },
  { label: 'Church gatherings', line: 'Free or paid registration with automatic confirmations', href: '/solutions/church-events' },
  { label: 'School events', line: 'Capacity limits and QR entry validation', href: '/solutions/school-events' },
];

export default function UseCaseCards() {
  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-10">Made for events like yours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {useCases.map((useCase) => (
            <Link
              key={useCase.href}
              href={useCase.href}
              className="group bg-gray-50 rounded-2xl border border-gray-100 p-5 sm:p-6 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary transition-colors mb-1">
                {useCase.label}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{useCase.line}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
