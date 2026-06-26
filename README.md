<div align="center">
  <h1>Sharkord Server</h1>
  <p><strong>Self-hosted real-time communication server with Web UI, API, and WebRTC media support</strong></p>

  [![Version](https://img.shields.io/github/v/release/kanuracer/sharkord-server)](https://github.com/kanuracer/sharkord-server/releases)
  [![License](https://img.shields.io/github/license/Sharkord/sharkord)](LICENSE)
  [![Bun](https://img.shields.io/badge/Bun-v1.3.14-green.svg)](https://bun.sh)
  [![Mediasoup](https://img.shields.io/badge/Mediasoup-v3.19.19-green.svg)](https://mediasoup.org)
</div>

## About this fork

This repository is the `kanuracer/sharkord-server` fork of [Sharkord/sharkord](https://github.com/Sharkord/sharkord).

Current public image tags:

| Tag | Purpose |
| --- | --- |
| `ghcr.io/kanuracer/sharkord-server:0.0.24-kr.1` | Current stable production tag |
| `ghcr.io/kanuracer/sharkord-server:latest` | Current stable image, moves when a new stable release is published |
| `ghcr.io/kanuracer/sharkord-server:kr-main` | Current `kr-main` branch image |
| `ghcr.io/kanuracer/sharkord-server:latest-beta` | Current beta/prerelease image |

> [!NOTE]
> Sharkord is alpha software. Bugs, incomplete features, and breaking changes are expected. Pin production deployments to a versioned image tag when you want controlled updates.

## What is Sharkord?

Sharkord is a self-hosted real-time communication server. Upstream Sharkord provides the core Web UI, API, channels, messages, roles, and WebRTC media features. This README focuses on this fork's deployment shape and fork-only additions.

## Kanuracer fork features

This section lists features added by the `kanuracer/sharkord-server` fork on top of upstream Sharkord.

### Deployment and image distribution

- Public multi-arch GHCR images for `linux/amd64` and `linux/arm64`.
- Versioned stable tags, `latest`, `kr-main`, and `latest-beta` image channels.
- Docker entrypoint with persistent config directory support.
- Optional `PUID`/`PGID` remapping for host-mounted config/data directories.
- Example Compose files under `deploy/` for pinned stable and `latest` deployments.
- Fork-aware update checks that track `kanuracer/sharkord-server` releases.

### Desktop compatibility API

- `desktop.capabilities` endpoint with fork flavor metadata so compatible clients can enable fork-only features only when the connected server supports them.
- Owner-token and server self-update routes exposed through the Desktop capability gate.
- Native Desktop client feature gates for fork-only moderation, voice, account, and admin workflows.

### Messaging, DMs, channels, and roles

- Direct-message conversation delete/hide support for compatible clients.
- Direct-message pinning support.
- Cross-category channel move support.
- Server-side channel access member filtering.
- Role weights for server-owned member sorting.
- Role mentions and role-mention fanout metadata.
- Thread unread inbox aggregation.
- Message edit attachment support.
- Incoming webhooks and retention-policy support.

### Account, auth, and security additions

- MFA/TOTP setup support plus app-password sessions.
- MFA reauth hardening and audit events for sensitive account-security actions.
- OIDC login provider support through environment configuration.
- Generic client-facing login failures while preserving precise internal auth logs.
- IP security rules, login-abuse controls, and trusted-proxy parsing for Docker/Nginx Proxy Manager deployments.

### Voice and WebRTC additions

- Voice user move and disconnect support plus moderator permission integration.
- Voice user media moderation support.
- Voice device hot-swap capability metadata.
- WebRTC announced-address capability metadata.
- Voice reactions and voice text-chat coupling.
- Voice soundboard capability metadata.
- Voice media recovery hardening.
- Channel links for voice/media workflows.
- Custom emoji reaction IDs.
- Custom user status and notification sound-control capability metadata.

## Desktop app

For the native desktop client, use [kanuracer/sharkord-desktop](https://github.com/kanuracer/sharkord-desktop).

Desktop downloads are published at [kanuracer/sharkord-desktop-releases](https://github.com/kanuracer/sharkord-desktop-releases/releases).

The Desktop app reads this server fork's capability endpoint and enables supported fork-only features only when the connected server advertises them. Unknown/original Sharkord servers fall back to the upstream-safe behavior.

## Documentation

- Upstream docs: [sharkord.com/docs](https://sharkord.com/docs)
- Fork deployment notes: this README plus the Compose files under `deploy/`

## Quick start: Docker

Run the current stable image:

```bash
docker run \
  --name sharkord \
  --restart unless-stopped \
  -p 4991:4991/tcp \
  -p 40000:40000/tcp \
  -p 40000:40000/udp \
  -e TZ=Europe/Berlin \
  -e SHARKORD_PORT=4991 \
  -e SHARKORD_AUTOUPDATE=false \
  -e SHARKORD_WEBRTC_PORT=40000 \
  -e SHARKORD_WEBRTC_ANNOUNCED_ADDRESS=your.domain.example \
  -v ./data:/home/bun/.config/sharkord \
  ghcr.io/kanuracer/sharkord-server:0.0.24-kr.1
```

Open:

```text
http://localhost:4991
```

If the server runs behind a reverse proxy, proxy HTTP/WebSocket traffic to port `4991` inside the container/network.

> [!WARNING]
> On first launch, Sharkord prints an owner/admin access token to the container logs. Store it securely. Anyone with that token can take owner access. It is not shown again and cannot be recovered from the UI.

## Docker Compose: production-style example

Example for a reverse-proxy Docker network plus direct WebRTC port exposure:

```yaml
services:
  sharkord:
    image: ghcr.io/kanuracer/sharkord-server:0.0.24-kr.1
    container_name: sharkord
    restart: unless-stopped
    ports:
      - "40000:40000/tcp"
      - "40000:40000/udp"
    environment:
      TZ: "Europe/Berlin"
      SHARKORD_PORT: "4991"
      SHARKORD_DEBUG: "false"
      SHARKORD_AUTOUPDATE: "false"
      SHARKORD_WEBRTC_PORT: "40000"
      SHARKORD_WEBRTC_ANNOUNCED_ADDRESS: "your.domain.example"
      SHARKORD_WEBRTC_MAX_BITRATE: "30000000"
      SHARKORD_TRUSTED_PROXIES: "172.19.0.0/16,fd00:dead:beef:19::/64"
    volumes:
      - /data/sharkord/config:/home/bun/.config/sharkord
    networks:
      - npm_net
    healthcheck:
      test: ["CMD-SHELL", "bash -c '</dev/tcp/127.0.0.1/4991'"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

networks:
  npm_net:
    external: true
    name: npm_default
```

Concrete Compose examples are available at:

```text
deploy/compose.sharkord.kanuracer.eu.yaml
deploy/compose.sharkord.kanuracer.eu.latest.yaml
```

## Ports and reverse proxy

| Port | Protocol | Purpose | Publish publicly? |
| --- | --- | --- | --- |
| `4991` | TCP/HTTP | Web UI and API | Usually no; proxy internally |
| `40000` | TCP/UDP | WebRTC media | Yes, if voice/video/screen share should work from outside |

Reverse proxy target example:

```text
http://sharkord:4991
```

Enable WebSocket forwarding in the reverse proxy.

If your proxy runs in the same Docker bridge network, set `SHARKORD_TRUSTED_PROXIES` to that bridge subnet so Sharkord can safely read `X-Forwarded-For` / `X-Real-IP` for login-abuse and IP-security decisions.

## Environment variables

| Variable | Example | Notes |
| --- | --- | --- |
| `TZ` | `Europe/Berlin` | Container timezone |
| `SHARKORD_PORT` | `4991` | HTTP/API listen port inside the container |
| `SHARKORD_DEBUG` | `false` | Debug logging |
| `SHARKORD_AUTOUPDATE` | `false` | Disable app self-update inside immutable Docker deployments |
| `SHARKORD_WEBRTC_PORT` | `40000` | WebRTC media port |
| `SHARKORD_WEBRTC_ANNOUNCED_ADDRESS` | `your.domain.example` | Public DNS name/IP clients should use for WebRTC |
| `SHARKORD_WEBRTC_MAX_BITRATE` | `30000000` | Optional max bitrate setting |
| `SHARKORD_TRUSTED_PROXIES` | `172.19.0.0/16,fd00:dead:beef:19::/64` | Comma-separated proxy IPs/CIDRs trusted for forwarded client IP headers |
| `SHARKORD_LOGIN_ABUSE_MAX_FAILED_ATTEMPTS` | `10` | Optional failed-login threshold override |
| `SHARKORD_LOGIN_ABUSE_WINDOW_MS` | `600000` | Optional failed-login window override |
| `SHARKORD_LOGIN_ABUSE_BLOCK_MS` | `900000` | Optional failed-login block duration override |
| `SHARKORD_OIDC_ENABLED` | `false` | Enables configured OIDC providers |
| `SHARKORD_OIDC_PROVIDERS` | JSON string | Provider configuration; keep secrets out of public docs and shell history |
| `PUID` / `PGID` | `1000` / `1000` | Optional host UID/GID mapping for mounted volumes |

## Updating

With Compose:

```bash
docker compose pull
docker compose up -d
docker logs -f sharkord
curl -fsS http://127.0.0.1:4991/info
```

Recommended production pinning:

```yaml
image: ghcr.io/kanuracer/sharkord-server:0.0.24-kr.1
```

Use `latest` only if you intentionally want to track the newest stable fork image.

Rollback to the previous pinned image by editing the Compose image tag, then running:

```bash
docker compose pull
docker compose up -d
```

## Building locally

Prerequisites:

- Bun `1.3.14`
- Docker with BuildKit/buildx if building container images

Install dependencies and build app binaries:

```bash
bun install --frozen-lockfile
cd apps/server
bun run build
```

Build Docker image from the repository root after the server build produced `apps/server/build/out/*`:

```bash
docker build -t sharkord-server:local .
```

Run local image:

```bash
docker run --rm \
  -p 4991:4991 \
  -p 40000:40000/tcp \
  -p 40000:40000/udp \
  -v "$PWD/.local-data:/home/bun/.config/sharkord" \
  sharkord-server:local
```

## Data and backup

Persistent server data lives in:

```text
/home/bun/.config/sharkord
```

When using Compose, back up the host-mounted directory, for example:

```text
/data/sharkord/config
```

Stop the container before restoring backups to avoid database/file races.

## Troubleshooting

### `unauthorized` while pulling from GHCR

The package should be public. If pull still fails:

```bash
docker logout ghcr.io
docker pull ghcr.io/kanuracer/sharkord-server:0.0.24-kr.1
```

If the package is private again, authenticate the Docker host with a token that has package read permission:

```bash
echo '<github-token>' | docker login ghcr.io -u <github-user> --password-stdin
```

### Web UI loads, but calls/media fail

Check:

- Reverse proxy forwards WebSockets.
- Proxy target is `sharkord:4991` or the correct container IP/port.
- `40000/tcp` and `40000/udp` are reachable from clients.
- `SHARKORD_WEBRTC_ANNOUNCED_ADDRESS` matches the public DNS/IP clients use.
- `SHARKORD_TRUSTED_PROXIES` contains the reverse-proxy network/IP when IP-security or login-abuse features need real client IPs.

### Login-abuse or IP-security logs show the proxy IP

Set `SHARKORD_TRUSTED_PROXIES` to the immediate reverse-proxy IP/CIDR. For a Docker bridge proxy network, use the bridge subnet, not the public client subnet.

### Container starts, then owner token appears in logs

That is expected on first launch. Save the token securely, then continue setup in the web UI.

### Volume permission errors

Set `PUID` and `PGID` to match the owner of the mounted host directory, or fix host directory ownership.

## Contributing

Upstream project: [Sharkord/sharkord](https://github.com/Sharkord/sharkord)

Fork repository: [kanuracer/sharkord-server](https://github.com/kanuracer/sharkord-server)

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Acknowledgments

Built with open-source technologies:

- [Bun](https://bun.sh)
- [tRPC](https://trpc.io)
- [Mediasoup](https://mediasoup.org)
- [Drizzle ORM](https://orm.drizzle.team)
- [React](https://react.dev)
- [Radix UI](https://www.radix-ui.com)
- [Tailwind CSS](https://tailwindcss.com)

<div align="center">
  <p>
    <a href="https://github.com/Sharkord/sharkord">Upstream GitHub</a> •
    <a href="https://github.com/kanuracer/sharkord-server">Fork GitHub</a>
  </p>
</div>
