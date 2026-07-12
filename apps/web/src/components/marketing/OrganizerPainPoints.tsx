const painPoints = [
  'Manual registration tracking',
  'Scattered Google Forms and spreadsheets',
  'Payment proof confusion',
  'Long check-in lines',
  'Missing attendee records',
  'Confirmations sent one by one',
  'No visibility on how the event is doing',
];

export default function OrganizerPainPoints() {
  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Running events on spreadsheets is costing you</h2>
          <p className="text-gray-500 mt-2">If any of these sound familiar, you&apos;re doing work the platform should be doing.</p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {painPoints.map((pain) => (
            <li key={pain} className="flex items-start gap-3 bg-gray-50 rounded-xl border border-gray-100 p-4">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-700">{pain}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
