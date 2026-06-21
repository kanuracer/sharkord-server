<div align="center">
  <h1>Sharkord Server</h1>
  <p><strong>A lightweight, self-hosted real-time communication platform</strong></p>

  [![Version](https://img.shields.io/github/v/release/kanuracer/sharkord-server)](https://github.com/kanuracer/sharkord-server/releases)
  [![License](https://img.shields.io/github/license/Sharkord/sharkord)](LICENSE)
  [![Bun](https://img.shields.io/badge/Bun-v1.3.14-green.svg)](https://bun.sh)
  [![Mediasoup](https://img.shields.io/badge/Mediasoup-v3.19.19-green.svg)](https://mediasoup.org)
</div>

## About this fork

This repository is the `kanuracer/sharkord-server` fork of [Sharkord/sharkord](https://github.com/Sharkord/sharkord).

Current fork additions:

- Public GHCR image: `ghcr.io/kanuracer/sharkord-server:latest`
- Stable fork tag: `ghcr.io/kanuracer/sharkord-server:0.0.23`
- Branch-current tag: `ghcr.io/kanuracer/sharkord-server:kr-main`
- Docker entrypoint with persistent config directory support
- Optional `PUID`/`PGID` remapping for host-mounted volumes
- Example production Compose file under `deploy/`

> [!NOTE]
> Sharkord itself is still alpha software. Bugs, incomplete features, and breaking changes are expected.

## What is Sharkord?

Sharkord is a self-hosted real-time communication server with web UI, API, chat, voice, video, and screen sharing support.

## Feature overview

### Core server

- Web UI and tRPC API for self-hosted real-time chat.
- Channels, categories, invites, direct messages, files, custom emojis, message search, pins, reactions, and threads.
- Role and permission management for members, channels, categories, moderation actions, and media controls.
- Voice rooms with WebRTC audio/video/screen sharing through Mediasoup.
- Plugin management, plugin settings, plugin logs, and slash-command execution.
- Persistent server settings, storage settings, server logo, and update status endpoints.

### Kanuracer fork additions

- Public multi-arch GHCR images with versioned tags, `latest`, and `kr-main`.
- Docker entrypoint with persistent config directory support and optional `PUID`/`PGID` remapping for mounted volumes.
- Desktop capability endpoint so compatible desktop clients can detect fork-only features.
- Direct-message conversation deletion support for compatible clients.
- Owner-token and server self-update routes exposed through the desktop capability gate.
- Voice user move support plus `Move members` role permission for moderators.
- Fork-aware update checks that track `kanuracer/sharkord-server` releases.

## Documentation

Upstream docs: [sharkord.com/docs](https://sharkord.com/docs)

Fork-specific deployment notes are in this README and in the Compose example under `deploy/`.

## Quick start: Docker

Run the public GHCR image:

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
  ghcr.io/kanuracer/sharkord-server:latest
```

Open:

```text
http://localhost:4991
```

If the server runs behind a reverse proxy, proxy HTTP/WebSocket traffic to port `4991` inside the container/network.

> [!WARNING]
> On first launch, Sharkord prints an owner/admin access token to the container logs. Store it securely. Anyone with that token can take owner access. It is not shown again and cannot be recovered from the UI.

## Docker Compose: production-style example

Example for a reverse-proxy network plus direct WebRTC port exposure:

```yaml
services:
  sharkord:
    image: ghcr.io/kanuracer/sharkord-server:latest
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

A concrete deployment file is available at:

```text
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
| `PUID` / `PGID` | `1000` / `1000` | Optional host UID/GID mapping for mounted volumes |

## Updating

With Compose:

```bash
docker compose pull
docker compose up -d
docker logs -f sharkord
```

Recommended production pinning:

```yaml
image: ghcr.io/kanuracer/sharkord-server:0.0.23
```

Use `latest` only if you want automatic tracking of the newest published fork image.

## Building locally

Prerequisites:

- Bun `1.3.14`
- Docker with BuildKit/buildx if building container images

Build app binaries:

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
docker pull ghcr.io/kanuracer/sharkord-server:latest
```

If the package is private again, authenticate the Docker host:

```bash
echo '<github-token>' | docker login ghcr.io -u kanuracer --password-stdin
```

### Web UI loads, but calls/media fail

Check:

- Reverse proxy forwards WebSockets
- Proxy target is `sharkord:4991` or the correct container IP/port
- `40000/tcp` and `40000/udp` are reachable from clients
- `SHARKORD_WEBRTC_ANNOUNCED_ADDRESS` matches the public DNS/IP clients use

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
- [ShadCN UI](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com)

<div align="center">
  <p>Made with ❤️ by the Sharkord team</p>
  <p>
    <a href="https://github.com/Sharkord/sharkord">Upstream GitHub</a> •
    <a href="https://github.com/kanuracer/sharkord-server">Fork GitHub</a>
  </p>
</div>
