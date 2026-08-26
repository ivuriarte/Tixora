'use client';

import { formatPHP } from '@axon-tickets/utils';
import type {
  EventOptionalInclusion,
  InclusionQuote,
  InclusionSelection,
} from '@axon-tickets/types';

interface AttendeeLabel {
  firstName: string;
  lastName: string;
}

interface Props {
  inclusions: EventOptionalInclusion[];
  attendees: AttendeeLabel[];
  selections: InclusionSelection[];
  quote: InclusionQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  onQuantityChange: (
    inclusionId: string,
    variantId: string,
    attendeeIndex: number,
    quantity: number,
  ) => void;
  onRefreshQuote: () => void;
}

function attendeeName(attendee: AttendeeLabel, index: number) {
  const name = `${attendee.firstName} ${attendee.lastName}`.trim();
  return name || `Attendee ${index + 1}`;
}

export default function OptionalAddOnsStep({
  inclusions,
  attendees,
  selections,
  quote,
  quoteLoading,
  quoteError,
  onQuantityChange,
  onRefreshQuote,
}: Props) {
  const selectedQuantity = (inclusionId: string, variantId: string, attendeeIndex: number) =>
    selections.find(
      (selection) =>
        selection.inclusionId === inclusionId &&
        selection.variantId === variantId &&
        selection.attendeeIndex === attendeeIndex,
    )?.quantity ?? 0;

  return (
    <section className="space-y-5" aria-labelledby="optional-addons-heading">
      <div className="overflow-hidden rounded-2xl border border-[#d8cdee] bg-white">
        <div className="border-b border-[#e4dcf4] bg-[#1a0533] px-5 py-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c4b5fd]">
            Step 2 · Personalize your booking
          </p>
          <h2 id="optional-addons-heading" className="axon-display mt-1 text-3xl">
            Optional add-ons
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#ddd6fe]">
            Add what you need for each attendee. These items are separate from admission and are
            claimed using the organizer&apos;s fulfillment instructions.
          </p>
        </div>

        <div className="space-y-7 p-4 sm:p-5">
          {attendees.map((attendee, attendeeIndex) => (
            <div key={attendeeIndex} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {attendeeIndex + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#1a0533]">
                    {attendeeName(attendee, attendeeIndex)}
                  </h3>
                  <p className="text-xs text-[#756a92]">Choose only the items assigned to this attendee.</p>
                </div>
              </div>

              <div className="space-y-3">
                {inclusions.map((inclusion) => (
                  <article key={inclusion.id} className="rounded-xl border border-[#e4dcf4] bg-[#faf8ff] p-4">
                    <div>
                      <h4 className="font-semibold text-gray-900">{inclusion.name}</h4>
                      {inclusion.description && (
                        <p className="mt-1 text-xs leading-5 text-gray-500">{inclusion.description}</p>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      {inclusion.variants.map((variant) => {
                        const quantity = selectedQuantity(inclusion.id, variant.id, attendeeIndex);
                        const soldOut = variant.isSoldOut || variant.availableQuantity <= 0 || variant.isActive === false;
                        const max = Math.max(
                          0,
                          Math.min(
                            variant.availableQuantity,
                            variant.maxPerRegistration ?? inclusion.maxPerRegistration ?? 10,
                          ),
                        );

                        return (
                          <div
                            key={variant.id}
                            className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 ${
                              quantity > 0 ? 'border-primary ring-1 ring-primary/15' : 'border-gray-200'
                            } ${soldOut ? 'opacity-60' : ''}`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{variant.name}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {soldOut
                                  ? 'Sold out'
                                  : `${formatPHP(variant.price)} · ${variant.availableQuantity} available`}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2" aria-label={`${variant.name} quantity`}>
                              <button
                                type="button"
                                onClick={() =>
                                  onQuantityChange(inclusion.id, variant.id, attendeeIndex, Math.max(0, quantity - 1))
                                }
                                disabled={quantity === 0 || soldOut}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cdee] text-lg font-medium text-[#6b5b8a] hover:border-primary disabled:cursor-not-allowed disabled:opacity-35"
                                aria-label={`Remove one ${variant.name} for ${attendeeName(attendee, attendeeIndex)}`}
                              >
                                −
                              </button>
                              <output className="w-5 text-center text-sm font-bold text-[#1a0533]">{quantity}</output>
                              <button
                                type="button"
                                onClick={() =>
                                  onQuantityChange(inclusion.id, variant.id, attendeeIndex, Math.min(max, quantity + 1))
                                }
                                disabled={soldOut || quantity >= max}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cdee] text-lg font-medium text-[#6b5b8a] hover:border-primary disabled:cursor-not-allowed disabled:opacity-35"
                                aria-label={`Add one ${variant.name} for ${attendeeName(attendee, attendeeIndex)}`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#d8cdee] bg-white p-5" aria-live="polite">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">Server-verified total</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Prices and availability are checked by Axon Tickets before your booking is created.
            </p>
          </div>
          {quoteLoading && (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              Checking
            </span>
          )}
        </div>

        {quoteError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p className="font-semibold">We could not confirm this selection.</p>
            <p className="mt-1">{quoteError}</p>
            <button type="button" onClick={onRefreshQuote} className="mt-3 font-bold text-red-800 underline">
              Check availability again
            </button>
          </div>
        ) : quote ? (
          <div className="mt-4 space-y-2 text-sm">
            {quote.lineItems.filter((item) => item.kind === 'admission' || item.kind === 'inclusion').map((item, index) => (
              <div key={`${item.kind}-${item.name}-${item.variantName ?? ''}-${index}`} className="flex justify-between gap-4 text-gray-600">
                <span>
                  {item.name}{item.variantName ? ` · ${item.variantName}` : ''} × {item.quantity}
                </span>
                <span>{item.total === 0 ? 'Free' : formatPHP(item.total)}</span>
              </div>
            ))}
            {quote.discount > 0 && (
              <div className="flex justify-between gap-4 font-medium text-emerald-700">
                <span>Discount</span>
                <span>−{formatPHP(quote.discount)}</span>
              </div>
            )}
            {quote.fees > 0 && (
              <div className="flex justify-between gap-4 text-gray-600">
                <span>Service fee</span>
                <span>{formatPHP(quote.fees)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold text-gray-900">
              <span>Total</span>
              <span className="text-primary">{quote.total === 0 ? 'Free' : formatPHP(quote.total)}</span>
            </div>
            <p className="pt-1 text-right text-[11px] text-gray-400">
              Quote expires {new Date(quote.expiresAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        ) : (
          <div className="mt-4 h-20 animate-pulse rounded-xl bg-gray-100" />
        )}
      </div>
    </section>
  );
}
