import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { EventsService } from './events.service';

/** The six admin-only field names. They may appear ONLY in admin/workspace code. */
const ADMIN_ONLY_FIELDS = [
  'ticketsConfirmed',
  'ticketsAwaitingReview',
  'ticketsHeld',
  'confirmedQuantity',
  'awaitingReviewQuantity',
  'heldQuantity',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('admin-only seat breakdown never reaches public responses', () => {
  it('withLiveInventory (used by public list, detail, discovery and on-site) returns none of the six fields', async () => {
    const prisma = {
      registration: { groupBy: jest.fn().mockResolvedValue([{ tierId: 't1', _sum: { attendeeCount: 4 } }]) },
      ticket: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new EventsService(prisma as never, {} as never, {} as never);
    const [tier] = await service.withLiveInventory([{ id: 't1', totalQuantity: 10 } as never]);
    const json = JSON.stringify(tier);
    for (const field of ADMIN_ONLY_FIELDS) expect(json).not.toContain(field);
    expect(Object.keys(tier).sort()).toEqual(['availableQuantity', 'id', 'isSoldOut', 'soldQuantity', 'totalQuantity']);
  });

  it('no public-facing module mentions any of the six fields', () => {
    const src = join(__dirname, '..');
    const publicDirs = ['events', 'discovery', 'seo', 'registrations'];
    const offenders: string[] = [];
    for (const dir of publicDirs) {
      let files: string[] = [];
      try {
        files = sourceFiles(join(src, dir));
      } catch {
        continue; // module does not exist in this build
      }
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        for (const field of ADMIN_ONLY_FIELDS) if (text.includes(field)) offenders.push(`${file}: ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
