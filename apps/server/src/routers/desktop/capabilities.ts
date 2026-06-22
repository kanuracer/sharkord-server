import { protectedProcedure } from '../../utils/trpc';

const capabilitiesRoute = protectedProcedure.query(() => ({
  flavor: 'kanuracer' as const,
  capabilities: {
    directMessageDelete: true,
    directMessageHide: true,
    ownerToken: true,
    serverSelfUpdate: true,
    voiceUserMove: true,
    voiceUserDisconnect: true,
    channelCrossCategoryMove: true,
    incomingWebhooks: true,
    retentionPolicies: true,
    mfaAppPasswords: true
  }
}));

export { capabilitiesRoute };
