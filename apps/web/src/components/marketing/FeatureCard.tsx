interface FeatureCardProps {
  title: string;
  description: string;
  iconPath?: string;
}

export default function FeatureCard({ title, description, iconPath }: FeatureCardProps) {
  return (
    <div className="rounded-lg border border-[#e4dcf4] bg-white p-6">
      {iconPath && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#ede9fe] text-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
      )}
      <h3 className="axon-label mb-2 text-sm text-[#1a0533]">{title}</h3>
      <p className="text-sm leading-relaxed text-[#6b5b8a]">{description}</p>
    </div>
  );
}
