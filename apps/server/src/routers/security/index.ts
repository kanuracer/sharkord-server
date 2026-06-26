import { ActivityLogType, Permission } from '@sharkord/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  activityLog,
  ipSecurityEvents,
  ipSecurityRules,
  users
} from '../../db/schema';
import { enqueueActivityLog } from '../../queues/activity-log';
import {
  findMatchingIpRule,
  isRuleActive,
  normalizeIpRange
} from '../../utils/ip-security';
import { protectedProcedure, t } from '../../utils/trpc';

const zIpRuleInput = z.object({
  ipRange: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine(
      (value) => Boolean(normalizeIpRange(value)),
      'Invalid IP/CIDR range'
    ),
  reason: z.string().trim().max(240).optional(),
  expiresAt: z.number().int().positive().nullable().optional()
});

const zRuleIdInput = z.object({ ruleId: z.number().int().positive() });
const zUnblockInput = z.object({
  ip: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine(
      (value) => Boolean(normalizeIpRange(value)),
      'Invalid IP/CIDR range'
    )
});

const requireSecurityAdmin = async (ctx: {
  hasPermission: (permission: Permission) => Promise<boolean>;
  needsPermission: (permission: Permission) => Promise<void>;
}) => {
  if (
    (await ctx.hasPermission(Permission.MANAGE_USERS)) ||
    (await ctx.hasPermission(Permission.MANAGE_SETTINGS))
  ) {
    return;
  }

  await ctx.needsPermission(Permission.MANAGE_USERS);
};

const activeRules = async () => {
  const now = Date.now();
  const rows = await db.select().from(ipSecurityRules);
  return rows.filter((rule) => isRuleActive(rule, now));
};

const insertSecurityEvent = async (input: {
  ip: string;
  identity?: string | null;
  event: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) =>
  db.insert(ipSecurityEvents).values({
    ip: input.ip,
    identity: input.identity ?? null,
    event: input.event,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    createdAt: Date.now()
  });

const addRule = async (
  kind: 'allow' | 'block',
  input: z.infer<typeof zIpRuleInput>,
  userId: number
) => {
  const ipRange = normalizeIpRange(input.ipRange);
  if (!ipRange) throw new Error('Invalid IP/CIDR range');

  const rule = await db
    .insert(ipSecurityRules)
    .values({
      kind,
      ipRange,
      reason: input.reason || null,
      expiresAt: input.expiresAt ?? null,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: null
    })
    .returning()
    .get();

  await insertSecurityEvent({
    ip: ipRange,
    event: kind === 'allow' ? 'ip_allowlisted' : 'ip_blocked',
    reason: input.reason ?? null,
    metadata: { ruleId: rule.id, createdBy: userId, expiresAt: rule.expiresAt }
  });

  return rule;
};

const getIpRulesRoute = protectedProcedure.query(async ({ ctx }) => {
  await requireSecurityAdmin(ctx);

  const rules = await activeRules();

  return {
    allowed: rules.filter((rule) => rule.kind === 'allow'),
    blocked: rules.filter((rule) => rule.kind === 'block')
  };
});

const addIpAllowlistRoute = protectedProcedure
  .input(zIpRuleInput)
  .mutation(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);
    return addRule('allow', input, ctx.userId);
  });

const addIpBlockRoute = protectedProcedure
  .input(zIpRuleInput)
  .mutation(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);
    return addRule('block', input, ctx.userId);
  });

const removeIpRuleRoute = protectedProcedure
  .input(zRuleIdInput)
  .mutation(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);

    const rule = await db
      .select()
      .from(ipSecurityRules)
      .where(eq(ipSecurityRules.id, input.ruleId))
      .get();

    await db
      .delete(ipSecurityRules)
      .where(eq(ipSecurityRules.id, input.ruleId))
      .run();

    if (rule) {
      await insertSecurityEvent({
        ip: rule.ipRange,
        event:
          rule.kind === 'allow' ? 'ip_allowlist_removed' : 'ip_block_removed',
        reason: rule.reason,
        metadata: { ruleId: rule.id, removedBy: ctx.userId }
      });
    }
  });

const unblockIpRoute = protectedProcedure
  .input(zUnblockInput)
  .mutation(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);

    const ip = normalizeIpRange(input.ip);
    if (!ip) throw new Error('Invalid IP/CIDR range');

    const rules = await activeRules();
    const matching = rules.filter(
      (rule) => rule.kind === 'block' && findMatchingIpRule(ip, [rule], 'block')
    );

    for (const rule of matching) {
      await db
        .delete(ipSecurityRules)
        .where(
          and(
            eq(ipSecurityRules.id, rule.id),
            eq(ipSecurityRules.kind, 'block')
          )
        )
        .run();
    }

    await insertSecurityEvent({
      ip,
      event: 'ip_unblocked',
      metadata: {
        removedRuleIds: matching.map((rule) => rule.id),
        removedBy: ctx.userId
      }
    });
  });

const zLimitedListInput = z
  .object({ limit: z.number().int().min(1).max(200).optional() })
  .optional();

const getSecurityEventsRoute = protectedProcedure
  .input(zLimitedListInput)
  .query(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);

    return db
      .select()
      .from(ipSecurityEvents)
      .orderBy(desc(ipSecurityEvents.createdAt))
      .limit(input?.limit ?? 100);
  });

const clearSecurityEventsRoute = protectedProcedure.mutation(async ({ ctx }) => {
  await requireSecurityAdmin(ctx);

  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: count() })
    .from(ipSecurityEvents);

  await db.delete(ipSecurityEvents).run();

  await insertSecurityEvent({
    ip: 'system',
    event: 'security_events_cleared',
    reason: 'Security events cleared by admin',
    metadata: { clearedBy: ctx.userId, clearedCount: total }
  });

  enqueueActivityLog({
    type: ActivityLogType.EDIT_SERVER_SETTINGS,
    userId: ctx.userId,
    details: {
      values: { securityEventsCleared: total }
    }
  });

  return { cleared: total };
});

const getAuditLogRoute = protectedProcedure
  .input(zLimitedListInput)
  .query(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);

    return db
      .select({
        id: activityLog.id,
        userId: activityLog.userId,
        type: activityLog.type,
        details: activityLog.details,
        ip: activityLog.ip,
        createdAt: activityLog.createdAt,
        user: {
          id: users.id,
          name: users.name,
          identity: users.identity
        }
      })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .orderBy(desc(activityLog.createdAt))
      .limit(input?.limit ?? 100);
  });

const securityRouter = t.router({
  getIpRules: getIpRulesRoute,
  addIpAllowlist: addIpAllowlistRoute,
  addIpBlock: addIpBlockRoute,
  removeIpRule: removeIpRuleRoute,
  unblockIp: unblockIpRoute,
  getSecurityEvents: getSecurityEventsRoute,
  clearSecurityEvents: clearSecurityEventsRoute,
  getAuditLog: getAuditLogRoute
});

export { insertSecurityEvent, securityRouter };
