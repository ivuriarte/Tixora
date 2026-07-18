interface EventCoverFallbackProps {
  title: string;
  startsAt: string;
  className?: string;
}

export default function EventCoverFallback({ title, startsAt, className = '' }: EventCoverFallbackProps) {
  const date = new Date(startsAt).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });

  return (
    <div
      className={`flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] p-5 text-white ${className}`}
      role="img"
      aria-label={`${title}, ${date}`}
    >
      <span className="axon-label text-[10px] text-[#c4b5fd]">Axon Tickets</span>
      <div>
        <p className="axon-display line-clamp-3 text-2xl">{title}</p>
        <p className="mt-3 text-sm font-semibold text-[#c4b5fd]">{date}</p>
      </div>
    </div>
  );
}
