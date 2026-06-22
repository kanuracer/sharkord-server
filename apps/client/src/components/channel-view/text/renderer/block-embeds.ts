import { hasSpecializedLinkOverride } from './helpers';

const BLOCK_EMBED_ATTRIBUTE = 'data-sharkord-block-embed="true"';

const hoistParagraphBlockEmbeds = (html: string): string => {
  if (!html.includes('<p') || !html.includes('<a')) {
    return html;
  }

  return html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) => {
    const blockEmbedMarkers: string[] = [];
    const seenUrls = new Set<string>();

    paragraph.replace(
      /<a\b([^>]*)\bhref=(["'])(.*?)\2([^>]*)>[\s\S]*?<\/a>/gi,
      (
        _anchor,
        beforeHref: string,
        _quote: string,
        href: string,
        afterHref: string
      ) => {
        if (
          beforeHref.includes('data-sharkord-block-embed') ||
          afterHref.includes('data-sharkord-block-embed') ||
          !hasSpecializedLinkOverride(href) ||
          seenUrls.has(href)
        ) {
          return _anchor;
        }

        seenUrls.add(href);
        blockEmbedMarkers.push(
          `<a ${BLOCK_EMBED_ATTRIBUTE} href="${href}"></a>`
        );

        return _anchor;
      }
    );

    if (blockEmbedMarkers.length === 0) {
      return paragraph;
    }

    return `${paragraph}${blockEmbedMarkers.join('')}`;
  });
};

export { hoistParagraphBlockEmbeds };
