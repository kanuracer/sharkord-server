import { DELETED_USER_IDENTITY_AND_NAME, UserStatus } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { publishUser } from '../../db/publishers';
import { users } from '../../db/schema';
import { protectedProcedure } from '../../utils/trpc';

const updateUserRoute = protectedProcedure
  .input(
    z.object({
      name: z
        .string()
        .min(1)
        .max(24)
        .refine((val) => val !== DELETED_USER_IDENTITY_AND_NAME, {
          message: 'Protected username'
        }),
      bannerColor: z
        .string()
        .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color'),
      bio: z.string().max(160).optional(),
      statusOverride: z.nativeEnum(UserStatus).nullable().optional(),
      statusMessage: z.string().max(80).nullable().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const updatedUser = await db
      .update(users)
      .set({
        name: input.name,
        bannerColor: input.bannerColor,
        bio: input.bio ?? null,
        statusOverride: input.statusOverride ?? null,
        statusMessage: input.statusMessage?.trim() || null
      })
      .where(eq(users.id, ctx.userId))
      .returning()
      .get();

    publishUser(updatedUser.id, 'update');
  });

export { updateUserRoute };
