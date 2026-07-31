'use client';

interface Step {
  id: number;
  label: string;
}

const LEGACY_STEPS: Step[] = [
  { id: 1, label: 'Attendee Details' },
  { id: 2, label: 'Payment & Proof' },
  { id: 3, label: 'Confirmation' },
];

interface Props {
  current: 1 | 2 | 3;
  flow?: 'legacy' | 'paid-payment-first' | 'paid-single';
}

export default function CheckoutStepper({ current, flow = 'legacy' }: Props) {
  const steps: Step[] = flow === 'paid-single'
    ? [
        { id: 1, label: 'Payment & Proof' },
        { id: 2, label: 'Confirmation' },
      ]
    : flow === 'paid-payment-first'
      ? [
          { id: 1, label: 'Payment & Proof' },
          { id: 2, label: 'Attendee Details' },
          { id: 3, label: 'Confirmation' },
        ]
      : LEGACY_STEPS;

  return (
    <nav aria-label="Checkout progress" className="mb-6">
      <ol className="flex items-center gap-2 sm:gap-3">
        {steps.map((step, idx) => {
          const isDone = step.id < current;
          const isActive = step.id === current;
          const dotBase =
            'h-7 w-7 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center transition-colors';
          const dotCls = isDone
            ? 'bg-primary text-white'
            : isActive
              ? 'bg-primary text-white ring-4 ring-primary/20'
              : 'bg-gray-200 text-gray-500';
          const labelCls = isActive
            ? 'text-gray-900 font-semibold'
            : isDone
              ? 'text-gray-700'
              : 'text-gray-400';

          return (
            <li key={step.id} className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div
                className={`${dotBase} ${dotCls} transition-all duration-300 ease-out ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 animate-fade-in"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <span className={`text-xs sm:text-sm whitespace-nowrap truncate transition-colors duration-200 ${labelCls}`}>
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`hidden sm:block h-px w-8 sm:w-12 transition-colors duration-500 ${
                    isDone ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
