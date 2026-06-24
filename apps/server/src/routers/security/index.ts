import { Permission } from '@sharkord/shared';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { ipSecurityEvents, ipSecurityRules } from '../../db/schema';
import { findMatchingIpRule, isRuleActive, normalizeIpRange } from '../../utils/ip-security';
import { protectedProcedure, t } from '../../utils/trpc';

const zIpRuleInput = z.object({
  ipRange: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine((value) => Boolean(normalizeIpRange(value)), 'Invalid IP/CIDR range'),
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
    .refine((value) => Boolean(normalizeIpRange(value)), 'Invalid IP/CIDR range')
});

const requireSecurityAdmin = async (ctx: {
  needsPermission: (permission: Permission) => Promise<void>;
}) => {
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

    await db.delete(ipSecurityRules).where(eq(ipSecurityRules.id, input.ruleId)).run();

    if (rule) {
      await insertSecurityEvent({
        ip: rule.ipRange,
        event: rule.kind === 'allow' ? 'ip_allowlist_removed' : 'ip_block_removed',
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
          and(eq(ipSecurityRules.id, rule.id), eq(ipSecurityRules.kind, 'block'))
        )
        .run();
    }

    await insertSecurityEvent({
      ip,
      event: 'ip_unblocked',
      metadata: { removedRuleIds: matching.map((rule) => rule.id), removedBy: ctx.userId }
    });
  });

const getSecurityEventsRoute = protectedProcedure
  .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
  .query(async ({ input, ctx }) => {
    await requireSecurityAdmin(ctx);

    return db
      .select()
      .from(ipSecurityEvents)
      .orderBy(desc(ipSecurityEvents.createdAt))
      .limit(input?.limit ?? 100);
  });

const securityRouter = t.router({
  getIpRules: getIpRulesRoute,
  addIpAllowlist: addIpAllowlistRoute,
  addIpBlock: addIpBlockRoute,
  removeIpRule: removeIpRuleRoute,
  unblockIp: unblockIpRoute,
  getSecurityEvents: getSecurityEventsRoute
});

export { securityRouter, insertSecurityEvent };
