import { EmojiPicker } from '@/components/emoji-picker';
import { PluginSlotRenderer } from '@/components/plugin-slot-renderer';
import type { TTiptapInputHandle } from '@/components/tiptap-input';
import { TiptapInput } from '@/components/tiptap-input';
import { LocalStorageKey } from '@/helpers/storage';

import { useChannelById } from '@/features/server/channels/hooks';
import {
  useCan,
  useChannelCan,
  usePublicServerSettings
} from '@/features/server/hooks';
import { useFlatPluginCommands } from '@/features/server/plugins/hooks';
import { useUploadFiles } from '@/hooks/use-upload-files';
import { getTRPCClient } from '@/lib/trpc';
import type { TReplyTarget } from '@/types';
import type { TJoinedPublicUser, TTempFile } from '@sharkord/shared';
import {
  ChannelPermission,
  isEmptyMessage,
  Permission,
  PluginSlot
} from '@sharkord/shared';
import { Button, Spinner } from '@sharkord/ui';
import { filesize } from 'filesize';
import { Image as ImageIcon, Paperclip, Reply, Send, Smile, X } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject
} from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_MAX_HEIGHT_VH } from '../channel-view/text/helpers';
import { useMessageAuthorName } from '../channel-view/text/hooks/use-message-author-name';
import { PreviewFile } from '../channel-view/text/preview-file';
import { UsersTypingIndicator } from '../channel-view/text/users-typing';
import { useFileAwareHeight } from './hooks';

type TMessageComposeProps = {
  channelId: number;
  message: string;
  onMessageChange: (value: string) => void;
  onSend: (message: string, files: TTempFile[]) => Promise<boolean>;
  onTyping: () => void;
  typingUsers: TJoinedPublicUser[];
  showPluginSlot?: boolean;
  composeContainerRef?: RefObject<HTMLDivElement | null>;
  inputStorageKey?: LocalStorageKey;
  inputDefaultMaxHeightVh?: number;
  replyTarget?: TReplyTarget;
  onCancelReply?: () => void;
  onArrowUp?: () => void;
  onResize?: () => void;
  isThread?: boolean;
  ref?: Ref<TMessageComposeHandle>;
};

type TMessageComposeHandle = {
  clearFiles: () => void;
  focus: () => void;
};

const MessageCompose = memo(
  ({
    channelId,
    message,
    onMessageChange,
    onSend,
    onTyping,
    typingUsers,
    showPluginSlot = false,
    composeContainerRef,
    inputStorageKey = LocalStorageKey.CHAT_INPUT_HEIGHT_VH,
    inputDefaultMaxHeightVh = DEFAULT_MAX_HEIGHT_VH,
    replyTarget,
    onCancelReply,
    onArrowUp,
    onResize,
    isThread = false,
    ref
  }: TMessageComposeProps) => {
    const { t } = useTranslation('common');
    const sendingRef = useRef(false);
    const internalContainerRef = useRef<HTMLDivElement | null>(null);
    const containerRef = composeContainerRef ?? internalContainerRef;
    const tiptapRef = useRef<TTiptapInputHandle>(null);
    const [sending, setSending] = useState(false);
    const [gifOpen, setGifOpen] = useState(false);
    const [gifQuery, setGifQuery] = useState('');
    const [gifLoading, setGifLoading] = useState(false);
    const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; url: string; previewUrl: string }>>([]);
    const can = useCan();
    const channelCan = useChannelCan(channelId);
    const channel = useChannelById(channelId);
    const publicSettings = usePublicServerSettings();
    const allPluginCommands = useFlatPluginCommands();
    const replyAuthorName = useMessageAuthorName({
      userId: replyTarget?.userId ?? 0,
      pluginId: replyTarget?.pluginId ?? ''
    });

    const canSendMessages = useMemo(() => {
      return (
        can(Permission.SEND_MESSAGES) &&
        channelCan(ChannelPermission.SEND_MESSAGES)
      );
    }, [can, channelCan]);

    const canUploadFiles = useMemo(() => {
      const canShareFilesInDm =
        !channel?.isDm || !!publicSettings?.storageFileSharingInDirectMessages;

      return (
        can(Permission.SEND_MESSAGES) &&
        can(Permission.UPLOAD_FILES) &&
        channelCan(ChannelPermission.SEND_MESSAGES) &&
        canShareFilesInDm
      );
    }, [can, channelCan, channel, publicSettings]);

    const placeholder = useMemo(() => {
      if (channel && !isThread && !channel.isDm) {
        return t('messageChannel', { name: channel.name });
      }
      return t('typeAMessage');
    }, [channel, isThread, t]);

    const pluginCommands = useMemo(
      () => (can(Permission.USE_PLUGINS) ? allPluginCommands : undefined),
      [can, allPluginCommands]
    );

    const {
      files,
      displayItems,
      removeFile,
      clearFiles,
      uploading,
      uploadingSize,
      uploadSpeed,
      openFileDialog,
      processFiles,
      fileInputProps
    } = useUploadFiles(channelId, containerRef, !canSendMessages);

    const searchGifs = useCallback(async (query = gifQuery) => {
      setGifLoading(true);
      try {
        const params = new URLSearchParams({ key: 'LIVDSRZULELA', q: query.trim() || 'trending', limit: '12', media_filter: 'minimal' });
        const response = await fetch(`https://api.tenor.com/v1/search?${params.toString()}`);
        if (!response.ok) throw new Error(`Tenor ${response.status}`);
        const payload = await response.json() as { results?: Array<{ id?: string; title?: string; content_description?: string; media?: Array<{ gif?: { url?: string }; tinygif?: { url?: string } }>; media_formats?: { gif?: { url?: string }; tinygif?: { url?: string }; nanogif?: { url?: string } } }> };
        setGifResults((payload.results ?? []).flatMap((item) => {
          const url = item.media?.[0]?.gif?.url || item.media_formats?.gif?.url;
          const previewUrl = item.media?.[0]?.tinygif?.url || item.media_formats?.tinygif?.url || item.media_formats?.nanogif?.url || url;
          return url && previewUrl ? [{ id: item.id || url, title: item.title || item.content_description || 'GIF', url, previewUrl }] : [];
        }));
      } finally {
        setGifLoading(false);
      }
    }, [gifQuery]);

    const attachGif = useCallback(async (gif: { title: string; url: string }) => {
      const response = await fetch(gif.url);
      if (!response.ok) throw new Error(`GIF ${response.status}`);
      const blob = await response.blob();
      const safeName = (gif.title || 'tenor').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tenor';
      await processFiles([new File([blob], `${safeName}.gif`, { type: 'image/gif' })]);
      setGifOpen(false);
    }, [processFiles]);

    useFileAwareHeight({
      containerRef,
      composeContainerRef,
      displayItems,
      inputStorageKey,
      inputDefaultMaxHeightVh
    });

    useImperativeHandle(
      ref,
      () => ({ clearFiles, focus: () => tiptapRef.current?.focus() }),
      [clearFiles]
    );

    const handleSend = useCallback(async () => {
      if (
        (isEmptyMessage(message) && !files.length) ||
        !canSendMessages ||
        sendingRef.current
      ) {
        return;
      }

      setSending(true);
      sendingRef.current = true;

      const maxFilesPerMessage =
        publicSettings?.storageMaxFilesPerMessage ?? Number.MAX_SAFE_INTEGER;
      const filesToSend = files.slice(0, Math.max(0, maxFilesPerMessage));

      const success = await onSend(message, filesToSend);

      sendingRef.current = false;
      setSending(false);

      if (success) {
        clearFiles();

        // if we were pinned down to the min then unpin now
        const el = containerRef.current;

        if (el?.dataset.pendingUnpinOnSend) {
          el.style.height = '';
          el.style.maxHeight = `${inputDefaultMaxHeightVh}vh`;

          delete el.dataset.pendingUnpinOnSend;
        }
      }
    }, [
      message,
      files,
      canSendMessages,
      onSend,
      clearFiles,
      publicSettings,
      containerRef,
      inputDefaultMaxHeightVh
    ]);

    const onRemoveFileClick = useCallback(
      async (fileId: string) => {
        removeFile(fileId);

        const trpc = getTRPCClient();

        try {
          trpc.files.deleteTemporary.mutate({ fileId });
        } catch {
          // ignore error
        }
      },
      [removeFile]
    );

    useEffect(() => {
      // focus the input when user clicks on reply
      if (replyTarget) {
        tiptapRef.current?.focus();
      }
    }, [replyTarget]);

    // TODO: check if this is really necessary
    useEffect(() => {
      if (!onResize) return;

      const el = containerRef.current;

      if (!el) return;

      const observer = new ResizeObserver(onResize);

      observer.observe(el);

      return () => observer.disconnect();
    }, [onResize, containerRef]);

    return (
      <div
        ref={containerRef}
        className="compose-container relative shrink-0 min-h-14 flex flex-col pb-[env(safe-area-inset-bottom)] bg-white/[0.03]"
      >
        <UsersTypingIndicator typingUsers={typingUsers} />

        <div
          className={`compose-scroll-row flex items-start flex-1 overflow-y-auto cursor-text${uploading ? ' bg-muted' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              tiptapRef.current?.focus();
            }
          }}
        >
          <div className="flex flex-1 flex-col">
            {replyTarget && (
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 mx-2 mt-3 px-2 py-1 text-xs">
                <div className="min-w-0 flex items-center gap-1.5 text-muted-foreground">
                  <Reply className="h-3.5 w-3.5 shrink-0" />
                  <span>{t('replyingTo', { username: replyAuthorName })}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={onCancelReply}
                  title={t('cancelReply')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {uploading && (
              <div className="flex items-center gap-2 px-2 pt-2">
                <div className="text-xs text-muted-foreground mb-1">
                  Uploading files ({filesize(uploadingSize)})
                  {uploadSpeed > 0 && ` - ${filesize(uploadSpeed)}/s`}
                </div>
                <Spinner size="xxs" />
              </div>
            )}
            {displayItems.length > 0 && (
              <div className="flex gap-1 flex-wrap px-4 pt-4">
                {displayItems.map((item) => (
                  <PreviewFile
                    key={item.id}
                    item={item}
                    onRemove={
                      item.file
                        ? () => onRemoveFileClick(item.file!.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
            <TiptapInput
              ref={tiptapRef}
              value={message}
              placeholder={placeholder}
              onChange={onMessageChange}
              onSubmit={handleSend}
              onTyping={onTyping}
              onArrowUp={onArrowUp}
              disabled={uploading || !canSendMessages}
              readOnly={sending}
              commands={pluginCommands}
            />
          </div>

          <input {...fileInputProps} />
          <div className="flex items-start pr-4 pt-2 shrink-0 sticky top-0">
            {showPluginSlot && (
              <PluginSlotRenderer slotId={PluginSlot.CHAT_ACTIONS} />
            )}

            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                disabled={uploading || !canUploadFiles}
                onClick={(event) => { event.preventDefault(); const next = !gifOpen; setGifOpen(next); if (next && !gifResults.length) void searchGifs(gifQuery); }}
                title="GIFs"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              {gifOpen && (
                <div className="absolute bottom-10 right-0 z-50 w-72 rounded-md border border-border bg-background p-2 shadow-xl" onClick={(event) => event.stopPropagation()}>
                  <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void searchGifs(gifQuery); }}>
                    <input className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm" value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} placeholder="GIF suchen…" />
                    <Button size="sm" type="submit" disabled={gifLoading}>{gifLoading ? '...' : 'Suchen'}</Button>
                  </form>
                  <div className="mt-2 grid max-h-72 grid-cols-3 gap-1 overflow-auto">
                    {gifResults.map((gif) => <button type="button" key={gif.id} className="overflow-hidden rounded bg-muted" onClick={() => void attachGif(gif)} title={gif.title}><img src={gif.previewUrl} alt={gif.title} className="h-20 w-full object-cover" loading="lazy" /></button>)}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">GIFs von Tenor</div>
                </div>
              )}
            </div>
            <EmojiPicker
              onEmojiSelect={(emoji) => tiptapRef.current?.insertEmoji(emoji)}
            >
              <Button
                size="icon"
                variant="ghost"
                disabled={uploading || !canSendMessages}
              >
                <Smile className="h-4 w-4" />
              </Button>
            </EmojiPicker>
            <Button
              size="icon"
              variant="ghost"
              disabled={uploading || !canUploadFiles}
              onClick={openFileDialog}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSend}
              disabled={uploading || sending || !canSendMessages}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

export { MessageCompose, type TMessageComposeHandle };
