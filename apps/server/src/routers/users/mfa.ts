import { ActivityLogType, sha256 } from '@sharkord/shared';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  activityLog,
  userAppPasswords,
  userMfaRecoveryCodes,
  users
} from '../../db/schema';
import { invariant } from '../../utils/invariant';
import {
  createRateLimiter,
  getRateLimitRetrySeconds
} from '../../utils/rate-limiters/rate-limiter';
import {
  createTotpUri,
  generateTotpSecret,
  verifyTotpCode
} from '../../utils/totp';
import { protectedProcedure, t, type Context } from '../../utils/trpc';
import { closeSocketsForAppPassword } from '../../utils/ws-client-registry';

const RECOVERY_CODE_COUNT = 10;
const MFA_REAUTH_RATE_LIMIT_MAX = 5;
const MFA_REAUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type ReauthAction = 'disable' | 'regenerate_recovery_codes';
type ReauthFailureReason = 'password' | 'totp';
type MfaRouteContext = Pick<
  Context,
  'userId' | 'user' | 'throwValidationError' | 'getConnectionInfo'
>;

const mfaReauthRateLimiter = createRateLimiter({
  maxRequests: MFA_REAUTH_RATE_LIMIT_MAX,
  windowMs: MFA_REAUTH_RATE_LIMIT_WINDOW_MS,
  maxEntries: 10_000
});

const generateRecoveryCode = () =>
  `shk_rec_${randomBytes(12).toString('base64url')}`;
const hashRecoveryCode = (code: string) => sha256(code.trim());

const createRecoveryCodes = async (tx: typeof db, userId: number) => {
  const now = Date.now();
  const recoveryCodes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    generateRecoveryCode
  );
  await tx
    .delete(userMfaRecoveryCodes)
    .where(eq(userMfaRecoveryCodes.userId, userId))
    .run();
  await tx
    .insert(userMfaRecoveryCodes)
    .values(
      await Promise.all(
        recoveryCodes.map(async (code) => ({
          userId,
          codeHash: await hashRecoveryCode(code),
          createdAt: now,
          usedAt: null
        }))
      )
    )
    .run();
  return recoveryCodes;
};

const getMfaReauthRateLimitKey = (ctx: MfaRouteContext, action: ReauthAction) =>
  `${ctx.userId}:${action}`;

const enforceMfaReauthRateLimit = (
  ctx: MfaRouteContext,
  action: ReauthAction
) => {
  const result = mfaReauthRateLimiter.consume(
    getMfaReauthRateLimitKey(ctx, action)
  );

  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Too many reauthentication attempts. Try again in ${getRateLimitRetrySeconds(result.retryAfterMs)} seconds.`
    });
  }
};

const insertAccountSecurityActivity = async (
  ctx: MfaRouteContext,
  type: ActivityLogType,
  details: Record<string, unknown>
) => {
  await db
    .insert(activityLog)
    .values({
      userId: ctx.userId,
      type,
      details,
      ip: ctx.getConnectionInfo()?.ip ?? null,
      createdAt: Date.now()
    })
    .run();
};

const recordReauthFailure = async (
  ctx: MfaRouteContext,
  action: ReauthAction,
  reason: ReauthFailureReason
) =>
  insertAccountSecurityActivity(ctx, ActivityLogType.MFA_REAUTH_FAILED, {
    action,
    reason
  });

const verifyCurrentCredentials = async (
  ctx: MfaRouteContext,
  input: { password: string; code?: string },
  action: ReauthAction
) => {
  enforceMfaReauthRateLimit(ctx, action);

  const user = await db
    .select({
      password: users.password,
      mfaSecret: users.mfaSecret,
      mfaEnabled: users.mfaEnabled
    })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();

  invariant(user, { code: 'NOT_FOUND', message: 'User not found' });

  if (!(await Bun.password.verify(input.password, user.password))) {
    await recordReauthFailure(ctx, action, 'password');
    ctx.throwValidationError('password', 'Current password is incorrect');
  }

  if (
    user.mfaEnabled &&
    (!input.code ||
      !user.mfaSecret ||
      !verifyTotpCode(user.mfaSecret, input.code))
  ) {
    await recordReauthFailure(ctx, action, 'totp');
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
    await verifyCurrentCredentials(ctx, input, 'disable');

    const now = Date.now();
    const revokedAppPasswords = await db.transaction(async (tx) => {
      const revoked = await tx
        .update(userAppPasswords)
        .set({ revokedAt: now })
        .where(
          and(
            eq(userAppPasswords.userId, ctx.userId),
            isNull(userAppPasswords.revokedAt)
          )
        )
        .returning({ id: userAppPasswords.id });

      await tx
        .delete(userMfaRecoveryCodes)
        .where(eq(userMfaRecoveryCodes.userId, ctx.userId))
        .run();

      await tx
        .update(users)
        .set({ mfaSecret: null, mfaEnabled: false, mfaEnabledAt: null })
        .where(eq(users.id, ctx.userId))
        .run();

      return revoked.length;
    });

    await insertAccountSecurityActivity(ctx, ActivityLogType.MFA_DISABLED, {
      appPasswordsRevoked: revokedAppPasswords > 0
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
    await verifyCurrentCredentials(ctx, input, 'regenerate_recovery_codes');
    const recoveryCodes = await db.transaction((tx) =>
      createRecoveryCodes(tx as typeof db, ctx.userId)
    );
    await insertAccountSecurityActivity(
      ctx,
      ActivityLogType.MFA_RECOVERY_CODES_REGENERATED,
      { count: recoveryCodes.length }
    );
    return recoveryCodes;
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
