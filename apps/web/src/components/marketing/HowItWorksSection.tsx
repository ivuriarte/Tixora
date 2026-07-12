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
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-5">{title}</h3>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0" aria-hidden="true">
              {i + 1}
            </span>
            <span className="text-gray-700 text-sm sm:text-base pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HowItWorksSection() {
  return (
    <section className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-10">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StepList title="For organizers" steps={organizerSteps} />
          <StepList title="For attendees" steps={attendeeSteps} />
        </div>
      </div>
    </section>
  );
}
