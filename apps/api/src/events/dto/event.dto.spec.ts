import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEventDto, CustomSectionDto } from './event.dto';

describe('CustomSectionDto', () => {
  function section(imageUrl?: string): CustomSectionDto {
    return Object.assign(new CustomSectionDto(), {
      title: 'Onsite registration',
      description: 'Walk-in registration is available at the venue.',
      imageUrl,
      isVisible: true,
    });
  }

  it.each([undefined, ''])(
    'accepts an omitted optional image URL (%p)',
    async (imageUrl) => {
      await expect(validate(section(imageUrl))).resolves.toHaveLength(0);
    },
  );

  it('still rejects a non-HTTPS image URL', async () => {
    const errors = await validate(section('http://example.com/image.jpg'));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'imageUrl',
          constraints: expect.objectContaining({
            matches: 'Image URL must use HTTPS',
          }),
        }),
      ]),
    );
  });

  it('requires alt text when an image URL is present', async () => {
    const errors = await validate(section('https://example.com/image.jpg'));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'imageAlt',
          constraints: expect.objectContaining({
            minLength: 'imageAlt must be longer than or equal to 3 characters',
          }),
        }),
      ]),
    );
  });

  it('accepts an image with valid alt text', async () => {
    const value = Object.assign(section('https://example.com/image.jpg'), {
      imageAlt: 'People dancing under purple lights',
    });

    await expect(validate(value)).resolves.toHaveLength(0);
  });
});

describe('CreateEventDto — Release 2.0 running events', () => {
  const validRunningEvent = {
    title: 'Inclusive City Run',
    venue: 'City Park',
    startsAt: '2027-01-10T05:00:00+08:00',
    category: 'sports',
    eventType: 'running',
    runningConfig: {
      distances: [{ name: '5K', code: '5K' }],
      ageGroups: [{ name: 'Open', minAge: 0, maxAge: 120 }],
      raceDivisions: ["Women's", "Men's", 'Non-binary', 'Open'],
      genderIdentityOptions: ['Woman', 'Man', 'Non-binary', 'Self-described', 'Prefer not to say'],
      merchandiseSizes: ['S', 'M', 'L'],
      claimMethods: ['self_claim', 'delivery'],
    },
  };

  it('accepts configurable inclusive race divisions and separate gender identities', async () => {
    const dto = plainToInstance(CreateEventDto, validRunningEvent);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects malformed distance codes before they reach bib assignment', async () => {
    const dto = plainToInstance(CreateEventDto, {
      ...validRunningEvent,
      runningConfig: {
        ...validRunningEvent.runningConfig,
        distances: [{ name: 'Five kilometres', code: '5 km!' }],
      },
    });

    const errors = await validate(dto);
    expect(JSON.stringify(errors)).toContain('Distance code must use 1-12 uppercase letters or numbers');
  });
});
