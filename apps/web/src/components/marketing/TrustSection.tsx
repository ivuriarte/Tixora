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
      <div className="page-container py-14 md:py-20">
        <div className="max-w-2xl mb-10">
          <h2 className="axon-display text-3xl md:text-5xl">{heading}</h2>
          {subheading && <p className="mt-3 text-[#6b5b8a]">{subheading}</p>}
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
