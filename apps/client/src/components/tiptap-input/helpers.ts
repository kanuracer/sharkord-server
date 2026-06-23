type TEmojiItem = {
  name: string;
  shortcodes: string[];
  fallbackImage?: string;
  emoji?: string;
};

// checks if the emoji is likely to be rendered as a text presentation emoji, which often look worse and less consistent across platforms than image presentation emojis
const isTextPresentation = (emoji: string): boolean => {
  const codepoints = [...emoji];

  if (codepoints.length !== 1) return false;

  const cp = codepoints[0].codePointAt(0)!;

  return (
    cp <= 0x00ae ||
    (cp >= 0x2000 && cp <= 0x2bff) ||
    (cp >= 0x3000 && cp <= 0x33ff)
  );
};

const getUserAgent = (userAgent?: string): string =>
  userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);

const shouldForceEmojiFallbackImages = (userAgent?: string): boolean =>
  /firefox|librewolf/i.test(getUserAgent(userAgent));

// checks if the emoji should use the fallback image (if available) instead of the native emoji character
const shouldUseFallbackImage = (emoji: TEmojiItem, userAgent?: string): boolean =>
  !!emoji.fallbackImage && (shouldForceEmojiFallbackImages(userAgent) || !emoji.emoji || isTextPresentation(emoji.emoji));

export { isTextPresentation, shouldForceEmojiFallbackImages, shouldUseFallbackImage, type TEmojiItem };
