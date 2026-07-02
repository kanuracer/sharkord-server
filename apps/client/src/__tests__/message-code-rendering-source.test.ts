import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('message code rendering source', () => {
  test('supports fenced code after HTML line breaks and safe React token highlighting', () => {
    const cache = readFileSync(join(import.meta.dir, '../components/channel-view/text/renderer/content-cache.ts'), 'utf8');
    const codeBlock = readFileSync(join(import.meta.dir, '../components/channel-view/text/renderer/code-block.tsx'), 'utf8');

    expect(cache).toContain('htmlToLineText');
    expect(cache).toContain('<br\\s*\\/?\\s*>');
    expect(cache).toContain('data-sharkord-code-block');
    expect(codeBlock).toContain('ReactNode[]');
    expect(codeBlock).toContain('navigator.clipboard.writeText(code)');
    expect(codeBlock).toContain('Copy code');
    expect(codeBlock).toContain('Copied');
    expect(codeBlock).not.toContain('dangerouslySetInnerHTML');
  });
});
