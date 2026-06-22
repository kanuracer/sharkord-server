import { sha256 } from '@sharkord/shared';
import { randomBytes } from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { userAppPasswords, userMfaRecoveryCodes, users } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import {
  createTotpUri,
  generateTotpSecret,
  verifyTotpCode
} from '../../utils/totp';
import { protectedProcedure, t } from '../../utils/trpc';
import { closeSocketsForAppPassword } from '../../utils/ws-client-registry';

const RECOVERY_CODE_COUNT = 10;
const generateRecoveryCode = () => `shk_rec_${randomBytes(12).toString('base64url')}`;
const hashRecoveryCode = (code: string) => sha256(code.trim());

const createRecoveryCodes = async (tx: typeof db, userId: number) => {
  const now = Date.now();
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await tx.delete(userMfaRecoveryCodes).where(eq(userMfaRecoveryCodes.userId, userId)).run();
  await tx.insert(userMfaRecoveryCodes).values(
    await Promise.all(recoveryCodes.map(async (code) => ({
      userId,
      codeHash: await hashRecoveryCode(code),
      createdAt: now,
      usedAt: null
    })))
  ).run();
  return recoveryCodes;
};

const verifyCurrentCredentials = async (ctx: { userId: number; throwValidationError: (field: string, message: string) => never }, input: { password: string; code?: string }) => {
  const user = await db
    .select({ password: users.password, mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();

  invariant(user, { code: 'NOT_FOUND', message: 'User not found' });

  if (!(await Bun.password.verify(input.password, user.password))) {
    ctx.throwValidationError('password', 'Current password is incorrect');
  }

  if (user.mfaEnabled && (!input.code || !user.mfaSecret || !verifyTotpCode(user.mfaSecret, input.code))) {
    ctx.throwValidationError('code', 'Invalid two-factor code');
  }
};

const statusRoute = protectedProcedure.query(async ({ ctx }) => {
  const user = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  const recoveryCodes = await db
    .select({ id: userMfaRecoveryCodes.id })
    .from(userMfaRecoveryCodes)
    .where(
      and(
        eq(userMfaRecoveryCodes.userId, ctx.userId),
        isNull(userMfaRecoveryCodes.usedAt)
      )
    );

  return { enabled: !!user?.mfaEnabled, recoveryCodesRemaining: recoveryCodes.length };
});

const startRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const secret = generateTotpSecret();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx
      .update(userAppPasswords)
      .set({ revokedAt: now })
      .where(
        and(
          eq(userAppPasswords.userId, ctx.userId),
          isNull(userAppPasswords.revokedAt)
        )
      )
      .run();

    await tx
      .delete(userMfaRecoveryCodes)
      .where(eq(userMfaRecoveryCodes.userId, ctx.userId))
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

    const recoveryCodes = await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ mfaEnabled: true, mfaEnabledAt: Date.now() })
        .where(eq(users.id, ctx.userId))
        .run();
      return createRecoveryCodes(tx as typeof db, ctx.userId);
    });

    return { enabled: true, recoveryCodes };
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
        .where(
          and(
            eq(userAppPasswords.userId, ctx.userId),
            isNull(userAppPasswords.revokedAt)
          )
        )
        .run();

      await tx
        .delete(userMfaRecoveryCodes)
        .where(eq(userMfaRecoveryCodes.userId, ctx.userId))
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

const regenerateRecoveryCodesRoute = protectedProcedure
  .input(
    z.object({
      password: z.string().min(4).max(128),
      code: z.string().trim().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await verifyCurrentCredentials(ctx, input);
    return db.transaction((tx) => createRecoveryCodes(tx as typeof db, ctx.userId));
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

    await closeSocketsForAppPassword(ctx.userId, updated.id);

    return { revoked: true };
  });

export const mfaRouter = t.router({
  status: statusRoute,
  start: startRoute,
  enable: enableRoute,
  disable: disableRoute,
  appPasswords: appPasswordsRoute,
  regenerateRecoveryCodes: regenerateRecoveryCodesRoute,
  revokeAppPassword: revokeAppPasswordRoute
});
