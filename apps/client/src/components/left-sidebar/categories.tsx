import { openDialog } from '@/features/dialogs/actions';
import { useChannels } from '@/features/server/channels/hooks';
import {
  useCategories,
  useCategoryById
} from '@/features/server/categories/hooks';
import {
  useCan,
  useCategoryUnreadData,
  useHasVisibleChannelsInCategory
} from '@/features/server/hooks';
import { getTRPCClient } from '@/lib/trpc';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Permission, TestId, getTrpcError } from '@sharkord/shared';
import { IconButton } from '@sharkord/ui';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CategoryContextMenu } from '../context-menus/category';
import { Dialog } from '../dialogs/dialogs';
import { Protect } from '../protect';
import { UnreadCount } from '../unread-count';
import {
  Channels,
  parseChannelSortableId
} from './channels';
import { useCategoryExpanded } from './hooks';

const CATEGORY_SORTABLE_PREFIX = 'category:';
const categorySortableId = (categoryId: number) => `${CATEGORY_SORTABLE_PREFIX}${categoryId}`;
const parseCategorySortableId = (id: unknown) => {
  if (typeof id !== 'string' || !id.startsWith(CATEGORY_SORTABLE_PREFIX)) {
    return undefined;
  }
  const parsed = Number(id.slice(CATEGORY_SORTABLE_PREFIX.length));
  return Number.isInteger(parsed) ? parsed : undefined;
};

type TCategoryProps = {
  categoryId: number;
};

const Category = memo(({ categoryId }: TCategoryProps) => {
  const { t } = useTranslation('sidebar');
  const can = useCan();
  const hasVisibleChannelsInCategory =
    useHasVisibleChannelsInCategory(categoryId);
  const { expanded, toggleExpanded } = useCategoryExpanded(categoryId);
  const category = useCategoryById(categoryId);
  const { unreadCount, hasUnreadMentions } = useCategoryUnreadData(categoryId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: categorySortableId(categoryId) });

  const onCreateChannelClick = useCallback(() => {
    openDialog(Dialog.CREATE_CHANNEL, { categoryId });
  }, [categoryId]);

  if (
    !category ||
    (!hasVisibleChannelsInCategory &&
      !can([Permission.MANAGE_CHANNELS, Permission.MANAGE_CATEGORIES]))
  ) {
    return null;
  }

  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform && { ...transform, x: 0 }),
        transition,
        opacity: isDragging ? 0.5 : 1
      }}
      className="mb-4"
      data-testid={TestId.CATEGORY_ITEM}
      data-category-id={category.id}
    >
      <div className="mb-1 flex w-full items-center px-2 py-1 text-xs font-semibold text-muted-foreground">
        <div className="flex w-full items-stretch gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            icon={ChevronIcon}
            onClick={toggleExpanded}
            title={expanded ? t('collapseCategory') : t('expandCategory')}
          />
          <CategoryContextMenu categoryId={category.id}>
            <span
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing flex min-w-0 flex-1 items-center gap-2"
            >
              <span className="truncate">{category.name}</span>
              {!expanded && unreadCount > 0 && (
                <UnreadCount
                  count={unreadCount}
                  hasMention={hasUnreadMentions}
                  className="ml-0"
                />
              )}
            </span>
          </CategoryContextMenu>
        </div>

        <Protect permission={Permission.MANAGE_CHANNELS}>
          <IconButton
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={onCreateChannelClick}
            title={t('createChannel')}
          />
        </Protect>
      </div>

      {expanded && <Channels categoryId={category.id} />}
    </div>
  );
});

const Categories = memo(() => {
  const { t } = useTranslation('sidebar');
  const can = useCan();
  const categories = useCategories();
  const channels = useChannels();
  const categoryIds = useMemo(
    () => categories.map((cat) => cat.id),
    [categories]
  );
  const categorySortableIds = useMemo(
    () => categoryIds.map(categorySortableId),
    [categoryIds]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const activeCategoryId = parseCategorySortableId(active.id);
      const overCategoryId = parseCategorySortableId(over.id);

      if (activeCategoryId !== undefined && overCategoryId !== undefined) {
        const oldIndex = categoryIds.indexOf(activeCategoryId);
        const newIndex = categoryIds.indexOf(overCategoryId);

        if (oldIndex === -1 || newIndex === -1) {
          return;
        }

        const reorderedIds = [...categoryIds];
        const [movedId] = reorderedIds.splice(oldIndex, 1);

        reorderedIds.splice(newIndex, 0, movedId);

        const trpc = getTRPCClient();

        try {
          await trpc.categories.reorder.mutate({ categoryIds: reorderedIds });
        } catch (error) {
          toast.error(getTrpcError(error, t('failedReorderCategories')));
        }
        return;
      }

      const activeChannelId = parseChannelSortableId(active.id);
      const overChannelId = parseChannelSortableId(over.id);
      const targetCategoryId = overChannelId !== undefined
        ? channels.find((channel) => channel.id === overChannelId)?.categoryId
        : overCategoryId;

      if (
        activeChannelId === undefined ||
        targetCategoryId === undefined ||
        targetCategoryId === null
      ) {
        return;
      }

      const sourceChannel = channels.find((channel) => channel.id === activeChannelId);
      if (!sourceChannel) {
        return;
      }

      const targetChannelIds = channels
        .filter((channel) => channel.categoryId === targetCategoryId)
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map((channel) => channel.id)
        .filter((channelId) => channelId !== activeChannelId);
      const targetIndex = overChannelId !== undefined
        ? targetChannelIds.indexOf(overChannelId)
        : targetChannelIds.length;
      const insertIndex = targetIndex < 0 ? targetChannelIds.length : targetIndex;
      targetChannelIds.splice(insertIndex, 0, activeChannelId);

      const trpc = getTRPCClient();

      try {
        await trpc.channels.reorder.mutate({
          categoryId: targetCategoryId,
          channelIds: targetChannelIds
        });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedReorderChannels')));
      }
    },
    [categoryIds, channels, t]
  );

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categorySortableIds}
          strategy={verticalListSortingStrategy}
          disabled={!can(Permission.MANAGE_CATEGORIES)}
        >
          {categories.map((category) => (
            <Category key={category.id} categoryId={category.id} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
});

export { Categories };
