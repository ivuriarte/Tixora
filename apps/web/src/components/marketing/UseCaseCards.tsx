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
      <div className="page-container py-14 md:py-20">
        <h2 className="axon-display mb-10 text-3xl md:text-5xl">Made for events like yours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {useCases.map((useCase) => (
            <Link
              key={useCase.href}
              href={useCase.href}
              className="group min-h-[132px] rounded-lg border border-[#e4dcf4] bg-[#f5f0ff] p-5 transition-colors hover:border-primary sm:p-6"
            >
              <h3 className="axon-label mb-2 text-sm text-[#1a0533] transition-colors group-hover:text-primary">
                {useCase.label}
              </h3>
              <p className="text-sm leading-relaxed text-[#6b5b8a]">{useCase.line}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
