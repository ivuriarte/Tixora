import FeatureCard from './FeatureCard';

export interface TrustFeature {
  title: string;
  description: string;
  iconPath?: string;
}

interface TrustSectionProps {
  heading: string;
  subheading?: string;
  features: TrustFeature[];
  background?: 'white' | 'gray';
}

export default function TrustSection({ heading, subheading, features, background = 'white' }: TrustSectionProps) {
  return (
    <section className={background === 'white' ? 'bg-white' : 'bg-gray-50'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{heading}</h2>
          {subheading && <p className="text-gray-500 mt-2">{subheading}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} iconPath={f.iconPath} />
          ))}
        </div>
      </div>
    </section>
  );
}
