import { getErrorMessage } from '@sharkord/shared';
import fs from 'fs/promises';
import { parse, stringify } from 'ini';
import z from 'zod';
import { applyEnvOverrides } from './helpers/apply-env-overrides';
import { deepMerge } from './helpers/deep-merge';
import { ensureServerDirs } from './helpers/ensure-server-dirs';
import { getPrivateIp, getPublicIp } from './helpers/network';
import { CONFIG_INI_PATH } from './helpers/paths';
import { IS_DEVELOPMENT } from './utils/env';

const [SERVER_PUBLIC_IP, SERVER_PRIVATE_IP] = await Promise.all([
  getPublicIp(),
  getPrivateIp()
]);

const zConfig = z.object({
  server: z.object({
    port: z.coerce.number().int().positive(),
    debug: z.coerce.boolean(),
    autoupdate: z.coerce.boolean()
  }),
  webRtc: z.object({
    port: z.coerce.number().int().positive(),
    announcedAddress: z.string(),
    maxBitrate: z.coerce.number().int().positive()
  }),
  oidc: z.object({
    enabled: z.coerce.boolean(),
    providers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        issuer: z.string(),
        clientId: z.string(),
        clientSecret: z.string().optional().default(''),
        authorizationEndpoint: z.string(),
        tokenEndpoint: z.string(),
        jwksUri: z.string(),
        scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
        allowEmailAutoLink: z.coerce.boolean().optional().default(false),
        allowRegistration: z.coerce.boolean().optional().default(false),
        emailClaim: z.string().optional().default('email'),
        nameClaim: z.string().optional().default('name'),
        subjectClaim: z.string().optional().default('sub'),
        jwks: z
          .object({ keys: z.array(z.record(z.string(), z.unknown())) })
          .optional()
      })
    )
  }),
  rateLimiters: z.object({
    sendAndEditMessage: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    joinVoiceChannel: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    joinServer: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    search: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    signalTyping: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    getMessages: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    markAsRead: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    toggleMessageReaction: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    addEmoji: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    openDirectMessage: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    handshake: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    })
  })
});

type TConfig = z.infer<typeof zConfig>;

const defaultConfig: TConfig = {
  server: {
    port: 4991,
    debug: IS_DEVELOPMENT,
    autoupdate: false
  },
  webRtc: {
    port: 40000,
    announcedAddress: '',
    maxBitrate: 30_000_000 // 30 Mbps
  },
  oidc: {
    enabled: false,
    providers: []
  },
  rateLimiters: {
    sendAndEditMessage: {
      maxRequests: 15,
      windowMs: 60_000
    },
    joinVoiceChannel: {
      maxRequests: 20,
      windowMs: 60_000
    },
    joinServer: {
      maxRequests: 5,
      windowMs: 60_000
    },
    search: {
      maxRequests: 15,
      windowMs: 60_000
    },
    signalTyping: {
      maxRequests: 40,
      windowMs: 5_000
    },
    getMessages: {
      maxRequests: 60,
      windowMs: 10_000
    },
    markAsRead: {
      maxRequests: 60,
      windowMs: 10_000
    },
    toggleMessageReaction: {
      maxRequests: 60,
      windowMs: 10_000
    },
    addEmoji: {
      maxRequests: 10,
      windowMs: 60_000
    },
    openDirectMessage: {
      maxRequests: 10,
      windowMs: 60_000
    },
    handshake: {
      maxRequests: 10,
      windowMs: 60_000
    }
  }
};

let config: TConfig = structuredClone(defaultConfig);

await ensureServerDirs();

const configExists = await fs.exists(CONFIG_INI_PATH);

if (!configExists) {
  // config does not exist, create it with the default config
  await fs.writeFile(CONFIG_INI_PATH, stringify(config));
} else {
  try {
    // config exists, we need to make sure it is up to date with the schema
    // to make this easy, we will read the existing config, merge it with the default config, and write it back to the file
    // this way we don't have to worry about migrating old config files when we add/remove config options
    const existingConfigText = await fs.readFile(CONFIG_INI_PATH, {
      encoding: 'utf-8'
    });

    const existingConfig = parse(existingConfigText) as Partial<TConfig>;
    const mergedConfig = deepMerge(config, existingConfig);

    config = zConfig.parse(mergedConfig);

    await fs.writeFile(CONFIG_INI_PATH, stringify(config));
  } catch (error) {
    // something went wrong, just log the error and overwrite the config file with the default config
    console.error(
      `Error reading or parsing config.ini. Overwriting with default config. Error: ${getErrorMessage(error)}`
    );

    await fs.writeFile(CONFIG_INI_PATH, stringify(config));
  }
}

config = applyEnvOverrides(config, {
  'server.port': 'SHARKORD_PORT',
  'server.debug': 'SHARKORD_DEBUG',
  'server.autoupdate': 'SHARKORD_AUTOUPDATE',
  'webRtc.port': 'SHARKORD_WEBRTC_PORT',
  'webRtc.announcedAddress': 'SHARKORD_WEBRTC_ANNOUNCED_ADDRESS',
  'webRtc.maxBitrate': 'SHARKORD_WEBRTC_MAX_BITRATE',
  'oidc.enabled': 'SHARKORD_OIDC_ENABLED',
  'oidc.providers': 'SHARKORD_OIDC_PROVIDERS'
});

config = Object.freeze(config);

export { config, SERVER_PRIVATE_IP, SERVER_PUBLIC_IP };
