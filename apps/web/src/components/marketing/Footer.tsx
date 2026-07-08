import Link from 'next/link';
import { solutionCategories } from '@/lib/solutions';

const FACEBOOK_URL = 'https://www.facebook.com/axonentertainment.ph';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <p className="text-white text-lg font-bold mb-3">Axon Tickets</p>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              Ticketing and registration for events in the Philippines.
            </p>
          </div>
          <nav aria-label="Discover">
            <p className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Discover</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Browse events
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Organizers">
            <p className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Organizers</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/organizers" className="text-sm text-gray-400 hover:text-white transition-colors">
                  For organizers
                </Link>
              </li>
              <li>
                <Link href="/become-organizer" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Apply as an organizer
                </Link>
              </li>
              {solutionCategories.map((category) => (
                <li key={category.slug}>
                  <Link href={`/solutions/${category.slug}`} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Contact">
            <p className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Contact</p>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                  <span className="sr-only">(opens in new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-gray-800 mt-10 pt-6">
          <p className="text-xs text-gray-500">© 2026 Axon Tickets. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
