import { config } from '../config';
import { getJsonBody, type HttpRouteHandler } from './helpers';
import { HttpValidationError } from './utils';

type OidcProviderConfig = {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  scopes: string[];
};

const publicProviders = (): OidcProviderConfig[] => {
  if (!config.oidc.enabled) return [];
  return config.oidc.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    issuer: provider.issuer,
    clientId: provider.clientId,
    authorizationEndpoint: provider.authorizationEndpoint,
    tokenEndpoint: provider.tokenEndpoint,
    jwksUri: provider.jwksUri,
    scopes: provider.scopes
  }));
};

const oidcConfigRouteHandler: HttpRouteHandler = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ enabled: config.oidc.enabled, providers: publicProviders() }));
};

const oidcLoginRouteHandler: HttpRouteHandler = async (req, res) => {
  const body = await getJsonBody<{ provider?: string; idToken?: string; code?: string; redirectUri?: string }>(req);
  if (!config.oidc.enabled) throw new HttpValidationError('oidc', 'OIDC login is not enabled');
  if (!body.provider) throw new HttpValidationError('provider', 'Provider is required');
  if (!body.idToken && !body.code) throw new HttpValidationError('oidc', 'OIDC idToken or code is required');

  // First-pass guard: config and UI flow are present, but token verification/account linking stay disabled until provider-specific rollout.
  throw new HttpValidationError('oidc', 'OIDC token verification is not configured');
};

export { oidcConfigRouteHandler, oidcLoginRouteHandler };
