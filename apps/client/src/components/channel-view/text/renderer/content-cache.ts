import { isEmojiOnlyMessage, type TJoinedMessage } from '@sharkord/shared';
import parse, { type DOMNode } from 'html-react-parser';
import type { ReactNode } from 'react';
import { hoistParagraphBlockEmbeds } from './block-embeds';
import { serializer } from './serializer';

const MAX_CACHE_SIZE = 500;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const htmlToLineText = (content: string) =>
  decodeHtmlEntities(
    content
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|li|pre)>\s*<\s*(p|div|li|pre)[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const renderFencedCodeBlocks = (content: string) => {
  const text = htmlToLineText(content);
  const match = text.match(/^```([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)\n?```$/) ||
    text.match(/```([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)\n?```/);

  if (match) {
    return `<pre data-sharkord-code-block="true" data-language="${escapeHtml(match[1] ?? '')}"><code>${escapeHtml(match[2] ?? '')}</code></pre>`;
  }

  return content.replace(/```([a-zA-Z0-9_-]*)(?:\r?\n|<br\s*\/?\s*>)([\s\S]*?)```/gi, (_match, language, code) =>
    `<pre data-sharkord-code-block="true" data-language="${escapeHtml(language)}"><code>${escapeHtml(code.replace(/<br\s*\/?\s*>/gi, '\n'))}</code></pre>`
  );
};

const parsedMessageCache = new Map<string, ReactNode>();
const emojiOnlyCache = new Map<string, boolean>();

const trimCache = (cache: Map<string, unknown>) => {
  if (cache.size < MAX_CACHE_SIZE) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (oldestKey) {
    cache.delete(oldestKey);
  }
};

const getMessageContentCacheKey = (message: TJoinedMessage) =>
  `${message.id}:${message.editedAt ?? 0}:${message.content ?? ''}`;

const getParsedMessageHtml = (message: TJoinedMessage) => {
  const cacheKey = getMessageContentCacheKey(message);

  if (parsedMessageCache.has(cacheKey)) {
    return parsedMessageCache.get(cacheKey);
  }

  trimCache(parsedMessageCache);

  const parsed = parse(hoistParagraphBlockEmbeds(renderFencedCodeBlocks(message.content ?? '')), {
    replace: (domNode: DOMNode) => serializer(domNode, message.id)
  });

  parsedMessageCache.set(cacheKey, parsed);

  return parsed;
};

const getIsEmojiOnly = (message: TJoinedMessage) => {
  const cacheKey = getMessageContentCacheKey(message);

  if (emojiOnlyCache.has(cacheKey)) {
    return emojiOnlyCache.get(cacheKey)!;
  }

  trimCache(emojiOnlyCache);

  const emojiOnly = isEmojiOnlyMessage(message.content);

  emojiOnlyCache.set(cacheKey, emojiOnly);

  return emojiOnly;
};

export { getIsEmojiOnly, getParsedMessageHtml };
