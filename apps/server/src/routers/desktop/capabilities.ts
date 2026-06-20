import { protectedProcedure } from '../../utils/trpc';

const capabilitiesRoute = protectedProcedure.query(() => ({
  flavor: 'kanuracer' as const,
  capabilities: {
    directMessageDelete: true,
    ownerToken: true,
    serverSelfUpdate: true,
    voiceUserMove: true
  }
}));

export { capabilitiesRoute };
