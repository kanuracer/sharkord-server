import { describe, expect, test } from 'bun:test';
import { hoistParagraphBlockEmbeds } from '../components/channel-view/text/renderer/block-embeds';

describe('message renderer block embeds', () => {
  test('hoists YouTube block embed markers out of paragraphs', () => {
    const input =
      '<p>watch <a href="https://youtu.be/dQw4w9WgXcQ">https://youtu.be/dQw4w9WgXcQ</a></p>';

    expect(hoistParagraphBlockEmbeds(input)).toBe(
      '<p>watch <a href="https://youtu.be/dQw4w9WgXcQ">https://youtu.be/dQw4w9WgXcQ</a></p><a data-sharkord-block-embed="true" href="https://youtu.be/dQw4w9WgXcQ"></a>'
    );
  });

  test('leaves normal paragraph links unchanged', () => {
    const input =
      '<p>read <a href="https://example.com/docs">https://example.com/docs</a></p>';

    expect(hoistParagraphBlockEmbeds(input)).toBe(input);
  });
});
