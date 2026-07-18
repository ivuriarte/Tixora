'use client';

import { useEffect, useState } from 'react';

export default function StickyEventCta({ fromPrice }: { fromPrice: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById('ticket-panel');
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#3b0764] bg-[#1a0533]/95 p-3 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={() => document.getElementById('ticket-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="axon-pill w-full bg-primary text-sm text-white hover:bg-primary-hover"
      >
        Get Tickets · {fromPrice}
      </button>
    </div>
  );
}
