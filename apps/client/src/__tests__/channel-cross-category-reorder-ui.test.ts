import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  readFileSync(path.resolve(import.meta.dir, '..', relativePath), 'utf8');

describe('cross-category channel reorder UI', () => {
  test('sidebar uses one DnD context for categories and channels', () => {
    const categories = read('components/left-sidebar/categories.tsx');
    const channels = read('components/left-sidebar/channels.tsx');

    expect(categories).toContain("parseChannelSortableId(active.id)");
    expect(categories).toContain("trpc.channels.reorder.mutate");
    expect(categories).toContain("failedReorderChannels");
    expect(categories).toContain("items={categorySortableIds}");
    expect(channels).toContain("useSortable({ id: channelSortableId(channelId) })");
    expect(channels).not.toContain("<DndContext");
  });

  test('reorder payload can include an external source channel id', () => {
    const categories = read('components/left-sidebar/categories.tsx');

    expect(categories).toContain(".filter((channelId) => channelId !== activeChannelId)");
    expect(categories).toContain("targetChannelIds.splice(insertIndex, 0, activeChannelId)");
    expect(categories).toContain("categoryId: targetCategoryId");
    expect(categories).toContain("channelIds: targetChannelIds");
  });
});
