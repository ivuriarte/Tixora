'use client';

import type { EventDraft, RunningEventConfig } from './types';

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function csvToList(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export default function RunningConfigEditor({
  draft,
  update,
}: {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}) {
  const config = draft.runningConfig;
  const updateConfig = (patch: Partial<RunningEventConfig>) =>
    update({ runningConfig: { ...config, ...patch } });

  return (
    <section className="space-y-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
      <div>
        <p className="text-primary text-xs font-extrabold uppercase tracking-[0.1em]">
          Running-event setup
        </p>
        <h3 className="mt-1 text-lg font-bold text-[#1a0533]">
          Race registration, bibs, and claiming
        </h3>
        <p className="mt-1 text-xs leading-5 text-[#6b5b8a]">
          Race Division is separate from optional Gender Identity. Bibs are assigned only after
          payment-proof approval and reset for every event and distance.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-800">Distances</label>
          <button
            type="button"
            onClick={() =>
              updateConfig({ distances: [...config.distances, { name: '', code: '' }] })
            }
            className="text-primary text-xs font-bold hover:underline"
          >
            + Add distance
          </button>
        </div>
        <div className="space-y-2">
          {config.distances.map((distance, index) => (
            <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
              <input
                aria-label={`Distance ${index + 1} name`}
                value={distance.name}
                onChange={(event) =>
                  updateConfig({
                    distances: config.distances.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
                placeholder="e.g. 5K"
                className={INPUT}
              />
              <input
                aria-label={`Distance ${index + 1} bib code`}
                value={distance.code}
                onChange={(event) =>
                  updateConfig({
                    distances: config.distances.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            code: event.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, '')
                              .slice(0, 12),
                          }
                        : item,
                    ),
                  })
                }
                placeholder="5K"
                className={INPUT}
              />
              <button
                type="button"
                aria-label={`Remove distance ${index + 1}`}
                disabled={config.distances.length === 1}
                onClick={() =>
                  updateConfig({
                    distances: config.distances.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                className="rounded-lg border border-gray-300 px-3 text-sm text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-800">Non-overlapping age groups</label>
          <button
            type="button"
            onClick={() =>
              updateConfig({
                ageGroups: [...config.ageGroups, { name: '', minAge: 0, maxAge: 120 }],
              })
            }
            className="text-primary text-xs font-bold hover:underline"
          >
            + Add age group
          </button>
        </div>
        <div className="space-y-2">
          {config.ageGroups.map((group, index) => (
            <div key={index} className="grid grid-cols-[1fr_80px_80px_auto] gap-2">
              <input
                aria-label={`Age group ${index + 1} name`}
                value={group.name}
                onChange={(event) =>
                  updateConfig({
                    ageGroups: config.ageGroups.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
                placeholder="e.g. Youth"
                className={INPUT}
              />
              <input
                aria-label={`Age group ${index + 1} minimum age`}
                type="number"
                min={0}
                max={120}
                value={group.minAge}
                onChange={(event) =>
                  updateConfig({
                    ageGroups: config.ageGroups.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, minAge: Number(event.target.value) } : item,
                    ),
                  })
                }
                className={INPUT}
              />
              <input
                aria-label={`Age group ${index + 1} maximum age`}
                type="number"
                min={0}
                max={120}
                value={group.maxAge}
                onChange={(event) =>
                  updateConfig({
                    ageGroups: config.ageGroups.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, maxAge: Number(event.target.value) } : item,
                    ),
                  })
                }
                className={INPUT}
              />
              <button
                type="button"
                aria-label={`Remove age group ${index + 1}`}
                disabled={config.ageGroups.length === 1}
                onClick={() =>
                  updateConfig({
                    ageGroups: config.ageGroups.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                className="rounded-lg border border-gray-300 px-3 text-sm text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Age groups must be continuous. Axon calculates each runner&apos;s completed age on the
          event date and stores the assigned group with the registration.
        </p>
      </div>

      {[
        ['Race Divisions', 'raceDivisions', "Women's, Men's, Non-binary, Open"],
        [
          'Gender Identity choices',
          'genderIdentityOptions',
          'Woman, Man, Non-binary, Self-described, Prefer not to say',
        ],
        ['Merchandise sizes', 'merchandiseSizes', 'XS, S, M, L, XL, 2XL'],
      ].map(([label, field, placeholder]) => (
        <label key={field} className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-800">{label}</span>
          <input
            value={(
              config[
                field as 'raceDivisions' | 'genderIdentityOptions' | 'merchandiseSizes'
              ] as string[]
            ).join(', ')}
            onChange={(event) => updateConfig({ [field]: csvToList(event.target.value) })}
            placeholder={placeholder}
            className={INPUT}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Comma-separated; organizers may add additional inclusive choices.
          </span>
        </label>
      ))}

      <fieldset>
        <legend className="text-sm font-semibold text-gray-800">Available claim methods</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {[
            ['self_claim', 'Self-claiming'],
            ['delivery', 'Delivery address'],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={config.claimMethods.includes(value as 'self_claim' | 'delivery')}
                onChange={(event) =>
                  updateConfig({
                    claimMethods: event.target.checked
                      ? [...new Set([...config.claimMethods, value as 'self_claim' | 'delivery'])]
                      : config.claimMethods.filter((item) => item !== value),
                  })
                }
                className="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
