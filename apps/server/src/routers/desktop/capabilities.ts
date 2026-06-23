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
    messageEditAttachments: true,
    roleMentions: true,
    roleMentionFanout: true,
    threadInbox: true,
    mfaAppPasswords: true,
    mfaReauthHardening: true,
    oidcLogin: true,
    voiceDeviceHotSwap: true,
    webRtcAnnouncedAddress: true
  }
}));

export { capabilitiesRoute };
