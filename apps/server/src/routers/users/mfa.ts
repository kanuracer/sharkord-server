import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { userAppPasswords, users } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import {
  createTotpUri,
  generateTotpSecret,
  verifyTotpCode
} from '../../utils/totp';
import { protectedProcedure, t } from '../../utils/trpc';

const statusRoute = protectedProcedure.query(async ({ ctx }) => {
  const user = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();

  return { enabled: !!user?.mfaEnabled };
});

const startRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const secret = generateTotpSecret();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx
      .update(userAppPasswords)
      .set({ revokedAt: now })
      .where(and(eq(userAppPasswords.userId, ctx.userId), isNull(userAppPasswords.revokedAt)))
      .run();

    await tx
      .update(users)
      .set({ mfaSecret: secret, mfaEnabled: false, mfaEnabledAt: null })
      .where(eq(users.id, ctx.userId))
      .run();
  });

  return {
    secret,
    otpauthUrl: createTotpUri(secret, ctx.user.identity)
  };
});

const enableRoute = protectedProcedure
  .input(z.object({ code: z.string().trim().min(6).max(16) }))
  .mutation(async ({ ctx, input }) => {
    const user = await db
      .select({ mfaSecret: users.mfaSecret })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .get();

    invariant(user?.mfaSecret, {
      code: 'BAD_REQUEST',
      message: 'Two-factor setup has not been started'
    });

    if (!verifyTotpCode(user.mfaSecret, input.code)) {
      ctx.throwValidationError('code', 'Invalid two-factor code');
    }

    await db
      .update(users)
      .set({ mfaEnabled: true, mfaEnabledAt: Date.now() })
      .where(eq(users.id, ctx.userId))
      .run();

    return { enabled: true };
  });

const disableRoute = protectedProcedure
  .input(
    z.object({
      password: z.string().min(4).max(128),
      code: z.string().trim().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const user = await db
      .select({
        password: users.password,
        mfaSecret: users.mfaSecret,
        mfaEnabled: users.mfaEnabled
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .get();

    invariant(user, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    if (!(await Bun.password.verify(input.password, user.password))) {
      ctx.throwValidationError('password', 'Current password is incorrect');
    }

    if (
      user.mfaEnabled &&
      (!input.code ||
        !user.mfaSecret ||
        !verifyTotpCode(user.mfaSecret, input.code))
    ) {
      ctx.throwValidationError('code', 'Invalid two-factor code');
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx
        .update(userAppPasswords)
        .set({ revokedAt: now })
        .where(and(eq(userAppPasswords.userId, ctx.userId), isNull(userAppPasswords.revokedAt)))
        .run();

      await tx
        .update(users)
        .set({ mfaSecret: null, mfaEnabled: false, mfaEnabledAt: null })
        .where(eq(users.id, ctx.userId))
        .run();
    });

    return { enabled: false };
  });

const appPasswordsRoute = protectedProcedure.query(async ({ ctx }) => {
  return db
    .select({
      id: userAppPasswords.id,
      name: userAppPasswords.name,
      createdAt: userAppPasswords.createdAt,
      lastUsedAt: userAppPasswords.lastUsedAt,
      revokedAt: userAppPasswords.revokedAt
    })
    .from(userAppPasswords)
    .where(eq(userAppPasswords.userId, ctx.userId))
    .orderBy(desc(userAppPasswords.createdAt));
});

const revokeAppPasswordRoute = protectedProcedure
  .input(z.object({ id: z.number().int().positive() }))
  .mutation(async ({ ctx, input }) => {
    const updated = await db
      .update(userAppPasswords)
      .set({ revokedAt: Date.now() })
      .where(
        and(
          eq(userAppPasswords.id, input.id),
          eq(userAppPasswords.userId, ctx.userId)
        )
      )
      .returning({ id: userAppPasswords.id })
      .get();

    invariant(updated, {
      code: 'NOT_FOUND',
      message: 'App password not found'
    });

    return { revoked: true };
  });

export const mfaRouter = t.router({
  status: statusRoute,
  start: startRoute,
  enable: enableRoute,
  disable: disableRoute,
  appPasswords: appPasswordsRoute,
  revokeAppPassword: revokeAppPasswordRoute
});
