import { t } from '../utils/trpc';
import { categoriesRouter } from './categories';
import { channelsRouter } from './channels';
import { desktopRouter } from './desktop';
import { dmsRouter } from './dms';
import { emojisRouter } from './emojis';
import { filesRouter } from './files';
import { invitesRouter } from './invites';
import { messagesRouter } from './messages';
import { othersRouter } from './others';
import { pluginsRouter } from './plugins';
import { retentionRouter } from './retention';
import { rolesRouter } from './roles';
import { securityRouter } from './security';
import { usersRouter } from './users';
import { voiceRouter } from './voice';
import { webhooksRouter } from './webhooks';

const appRouter = t.router({
  others: othersRouter,
  desktop: desktopRouter,
  messages: messagesRouter,
  users: usersRouter,
  channels: channelsRouter,
  dms: dmsRouter,
  files: filesRouter,
  emojis: emojisRouter,
  roles: rolesRouter,
  invites: invitesRouter,
  voice: voiceRouter,
  categories: categoriesRouter,
  plugins: pluginsRouter,
  webhooks: webhooksRouter,
  retention: retentionRouter,
  security: securityRouter
});

type AppRouter = typeof appRouter;

export { appRouter };
export type { AppRouter };
