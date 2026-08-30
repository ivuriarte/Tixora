import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

describe('EventsService running age-group configuration', () => {
  const service = new EventsService({} as any, {} as any, {} as any);
  const base = {
    eventType: 'running',
    runningConfig: {
      distances: [{ name: '5K', code: '5K' }],
      ageGroups: [
        { name: 'Junior', minAge: 12, maxAge: 17 },
        { name: 'Open', minAge: 18, maxAge: 39 },
      ],
      raceDivisions: ['Open'],
      genderIdentityOptions: ['Prefer not to say'],
      merchandiseSizes: ['M'],
      claimMethods: ['pickup'],
    },
  };

  it('accepts contiguous, non-overlapping age groups', () => {
    expect(() => (service as any).validateRunningConfig(base)).not.toThrow();
  });

  it('rejects an uncovered age gap by default', () => {
    const dto = {
      ...base,
      runningConfig: {
        ...base.runningConfig,
        ageGroups: [
          { name: 'Junior', minAge: 12, maxAge: 17 },
          { name: 'Open', minAge: 20, maxAge: 39 },
        ],
      },
    };
    expect(() => (service as any).validateRunningConfig(dto)).toThrow(BadRequestException);
  });
});
