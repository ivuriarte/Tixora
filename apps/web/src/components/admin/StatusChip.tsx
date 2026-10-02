/**
 * Admin status chips, shared so the Verifications queue, the Events list, the dashboard and the
 * event editor all use the same colours and words. Colour is never the only signal: every chip
 * carries a dot AND a text label.
 */
export type ChipTone = 'blue' | 'emerald' | 'red' | 'amber' | 'gray';

export const CHIP_TONES: Record<ChipTone, { dot: string; chip: string }> = {
  blue: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' },
  emerald: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  red: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
  gray: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20' },
};

export const STATUS_CONFIG: Record<string, { label: string; dot: string; chip: string }> = {
  pending_approval: { label: 'Awaiting Review', ...CHIP_TONES.blue },
  proof_submitted: { label: 'Under Review', ...CHIP_TONES.blue },
  verified: { label: 'Verified', ...CHIP_TONES.emerald },
  rejected: { label: 'Rejected', ...CHIP_TONES.red },
  pending_payment: { label: 'Pending Payment', ...CHIP_TONES.amber },
};

export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const { dot, chip } = CHIP_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return <Chip tone="gray">{status}</Chip>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
