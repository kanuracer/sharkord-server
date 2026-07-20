import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const clientRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(clientRoot, path), 'utf8');

describe('channel reference mention source contract', () => {
  test('suggestions exclude DMs and channel types that cannot be referenced', () => {
    const selectors = read('features/server/channels/selectors.ts');

    expect(selectors).toContain('referenceableChannelsSelector');
    expect(selectors).toContain('!channel.isDm');
    expect(selectors).toContain('channel.type === ChannelType.TEXT');
    expect(selectors).toContain('channel.type === ChannelType.VOICE');
  });

  test('suggestions require VIEW_CHANNEL for every referenced channel', () => {
    const selectors = read('features/server/channels/selectors.ts');

    expect(selectors).toContain(
      'permissions[channel.id]?.permissions?.VIEW_CHANNEL === true'
    );
  });

  test('the composer uses the restricted selector and emits safe reference markup', () => {
    const composer = read('components/tiptap-input/index.tsx');
    const extension = read(
      'components/tiptap-input/extensions/channel-reference/index.ts'
    );

    const node = read(
      'components/tiptap-input/extensions/channel-reference/node.tsx'
    );

    expect(composer).toContain('useReferenceableChannels');
    expect(composer).toContain('ChannelReference.configure');
    expect(node).toContain("'data-type': 'channel-reference'");
    expect(node).not.toContain('node.attrs.label');
    expect(node).not.toContain('label:');
    expect(extension).toContain('attrs: { channelId: props.id }');
  });

  test('the renderer recognizes reference markup without trusting a serialized name', () => {
    const serializer = read(
      'components/channel-view/text/renderer/serializer.tsx'
    );
    const chip = read('components/channel-chip/index.tsx');

    expect(serializer).toContain("'data-type'] === 'channel-reference'");
    expect(serializer).toContain("'data-channel-id'");
    expect(serializer).toContain('Number.isSafeInteger(channelId) && channelId > 0');
    expect(chip).toContain('if (!canReference)');
    expect(chip).toContain('#Unavailable channel');
    expect(chip).toContain('#{channel.name}');
    expect(chip.indexOf('if (!canReference)')).toBeLessThan(
      chip.indexOf('#{channel.name}')
    );
  });
});
