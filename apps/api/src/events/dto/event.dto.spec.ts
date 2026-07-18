import { validate } from 'class-validator';
import { CustomSectionDto } from './event.dto';

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
