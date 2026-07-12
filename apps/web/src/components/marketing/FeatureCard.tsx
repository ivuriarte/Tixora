interface FeatureCardProps {
  title: string;
  description: string;
  iconPath?: string;
}

export default function FeatureCard({ title, description, iconPath }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {iconPath && (
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
