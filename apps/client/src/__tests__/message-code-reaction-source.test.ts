import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('message code block and reaction fixes', () => {
  test('webclient renders highlighted fenced/pre code blocks', () => {
    const cache = read('components/channel-view/text/renderer/content-cache.ts');
    const serializer = read('components/channel-view/text/renderer/serializer.tsx');
    const codeBlock = read('components/channel-view/text/renderer/code-block.tsx');

    expect(cache).toContain('renderFencedCodeBlocks');
    expect(serializer).toContain('CodeBlock');
    expect(serializer).toContain("domNode.name === 'pre'");
    expect(codeBlock).toContain('ReactNode[]');
    expect(codeBlock).not.toContain('dangerouslySetInnerHTML');
    expect(codeBlock).toContain('data-language');
  });

  test('reaction order uses descending createdAt and never renders broken img without a URL', () => {
    const reactions = read('components/channel-view/text/message-reactions.tsx');
    expect(reactions).toContain('(a, b) => b.createdAt - a.createdAt');
    expect(reactions).not.toContain('(a, b) => b.createdAt + a.createdAt');
    expect(reactions).toContain('if (!imgSrc)');
    expect(reactions).toContain('`:${emojiName}:`');
  });

  test('message composer exposes Tenor GIF search and uploads selected GIFs', () => {
    const compose = read('components/message-compose/index.tsx');
    const uploadHook = read('hooks/use-upload-files.ts');
    expect(compose).toContain('api.tenor.com/v1/search');
    expect(compose).toContain('GIFs von Tenor');
    expect(compose).toContain('attachGif');
    expect(uploadHook).toContain('processFiles');
  });
});
