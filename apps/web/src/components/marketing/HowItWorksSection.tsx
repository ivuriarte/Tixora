const organizerSteps = [
  'Create your event',
  'Share your event page',
  'Accept registrations or ticket purchases',
  'Validate attendees with QR check-in',
  'Track attendees and reports',
];

const attendeeSteps = [
  'Choose an event',
  'Register or reserve a ticket',
  'Receive your confirmation and QR code by email',
  'Present your QR code at the event',
];

function StepList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border border-[#e4dcf4] bg-white p-6 sm:p-8">
      <h3 className="axon-label mb-5 text-base text-[#1a0533]">{title}</h3>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-sm font-bold text-primary" aria-hidden="true">
              {i + 1}
            </span>
            <span className="pt-0.5 text-sm text-[#4f416c] sm:text-base">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HowItWorksSection() {
  return (
    <section className="bg-gray-50">
      <div className="page-container py-14 md:py-20">
        <h2 className="axon-display mb-10 text-3xl md:text-5xl">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StepList title="For organizers" steps={organizerSteps} />
          <StepList title="For attendees" steps={attendeeSteps} />
        </div>
      </div>
    </section>
  );
}
