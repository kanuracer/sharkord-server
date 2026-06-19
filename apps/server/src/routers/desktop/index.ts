import { t } from '../../utils/trpc';
import { capabilitiesRoute } from './capabilities';

export const desktopRouter = t.router({
  capabilities: capabilitiesRoute
});
