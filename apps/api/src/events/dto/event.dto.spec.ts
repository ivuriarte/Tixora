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
});
