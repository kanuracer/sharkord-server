import { parseDomCommand } from '@sharkord/shared';
import { Element, type DOMNode } from 'html-react-parser';
import { CommandOverride } from '../overrides/command';
import { ChannelReferenceOverride } from '../overrides/channel-reference';
import { MentionOverride } from '../overrides/mention';
import { YoutubeOverride } from '../overrides/youtube';
import { CodeBlock } from './code-block';
import { getYoutubeInfo } from './helpers';

const serializer = (domNode: DOMNode, messageId: number) => {
  try {
    if (domNode instanceof Element && domNode.name === 'pre') {
      const codeNode = domNode.children.find(
        (child) => child instanceof Element && child.name === 'code'
      ) as Element | undefined;
      const text = codeNode?.children.map((child: any) => child.data ?? '').join('') ?? '';

      return (
        <CodeBlock
          code={text}
          language={domNode.attribs['data-language'] || codeNode?.attribs?.['data-language']}
        />
      );
    } else if (domNode instanceof Element && domNode.name === 'code') {
      const text = domNode.children.map((child: any) => child.data ?? '').join('');

      return <CodeBlock code={text} inline />;
    } else if (domNode instanceof Element && domNode.name === 'a') {
      const href = domNode.attribs.href;
      const isBlockEmbed =
        domNode.attribs['data-sharkord-block-embed'] === 'true';

      if (!URL.canParse(href)) {
        return undefined;
      }

      if (!isBlockEmbed) {
        return undefined;
      }

      const { videoId } = getYoutubeInfo(href);

      if (videoId) {
        return <YoutubeOverride videoId={videoId} />;
      }
    } else if (domNode instanceof Element && domNode.name === 'command') {
      const command = parseDomCommand(domNode);

      return <CommandOverride command={command} />;
    } else if (
      domNode instanceof Element &&
      domNode.name === 'span' &&
      domNode.attribs['data-type'] === 'mention' &&
      domNode.attribs['data-user-id']
    ) {
      const userId = parseInt(domNode.attribs['data-user-id'], 10);

      if (!Number.isNaN(userId)) {
        return <MentionOverride userId={userId} />;
      }
    } else if (
      domNode instanceof Element &&
      domNode.name === 'span' &&
      domNode.attribs['data-type'] === 'channel-reference' &&
      domNode.attribs['data-channel-id']
    ) {
      const channelId = Number(domNode.attribs['data-channel-id']);

      if (Number.isSafeInteger(channelId) && channelId > 0) {
        return <ChannelReferenceOverride channelId={channelId} />;
      }
    }
  } catch (error) {
    console.error(`Error parsing DOM node for message ID ${messageId}:`, error);
  }

  return undefined;
};

export { serializer };
