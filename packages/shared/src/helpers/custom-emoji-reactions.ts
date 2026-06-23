const CUSTOM_EMOJI_REACTION_PREFIX = 'custom';

const CUSTOM_EMOJI_REACTION_RE = /^custom:(\d+):([a-zA-Z0-9_-]{1,64})$/;

type TCustomEmojiReactionInput = {
  customId?: number | null;
  id?: number | null;
  name?: string;
  shortcodes?: string[];
  emoji?: string;
};

type TParsedCustomEmojiReaction = {
  id: number;
  name: string;
};

const parseCustomEmojiReactionValue = (
  value: string
): TParsedCustomEmojiReaction | null => {
  const match = value.match(CUSTOM_EMOJI_REACTION_RE);
  if (!match) return null;

  const id = Number(match[1]);
  if (!Number.isInteger(id) || id <= 0) return null;

  return { id, name: match[2]! };
};

const customEmojiReactionName = (value: string): string =>
  parseCustomEmojiReactionValue(value)?.name ?? value;

const customEmojiReactionValue = (
  emoji: TCustomEmojiReactionInput | string
): string => {
  if (typeof emoji === 'string') return emoji;

  const customId = Number(emoji.customId ?? emoji.id);
  const name = (emoji.name || emoji.shortcodes?.[0] || '').trim();

  if (Number.isInteger(customId) && customId > 0 && name) {
    return `${CUSTOM_EMOJI_REACTION_PREFIX}:${customId}:${name}`;
  }

  return emoji.emoji || emoji.shortcodes?.[0] || name;
};

export {
  CUSTOM_EMOJI_REACTION_PREFIX,
  customEmojiReactionName,
  customEmojiReactionValue,
  parseCustomEmojiReactionValue,
  type TParsedCustomEmojiReaction
};
