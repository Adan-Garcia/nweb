# Deploying

Two ways to put Cuervo Planner on the internet. Both run the server at home (or on any box)
in Docker, reached through a **Cloudflare Tunnel**, so no port is opened on your router and
HTTPS comes from Cloudflare.

| | One origin (recommended) | App on your own site |
| --- | --- | --- |
| Where the app is served from | The server, through the tunnel | Your existing site (any static host) |
| Where the API is | The same address | The tunnel's address |
| CORS | Not involved | `ALLOWED_ORIGINS` must list your site |
| Build | Done inside the Docker image | `VITE_API_URL=https://… npm run build`, then upload `dist/` |

Either way, the app must be served from the **root** of its domain (`https://planner.example.com/`,
not `https://example.com/planner/`): the router and the service worker both assume `/`.

## 1. What you need

- Docker with Compose, on the machine that will run the server.
- A Cloudflare account and a domain whose DNS is on Cloudflare (for the tunnel).
- This repository, checked out on that machine.

## 2. The `.env` file

Create `.env` next to `docker-compose.yml`. It is git-ignored; keep it that way.

```sh
# Both required. Generate each with: openssl rand -base64 32
POSTGRES_PASSWORD=…
SERVER_SECRET=…            # must never change once people have accounts

# The tunnel (step 3).
TUNNEL_TOKEN=…
CLIENT_IP_HEADER=cf-connecting-ip

# Who may create an account. Leave empty and anyone who finds the address can.
REGISTRATION_EMAILS=you@example.com,family@example.com

# Only for "app on your own site": the site's origin, exactly, no trailing slash.
# ALLOWED_ORIGINS=https://www.example.com

# Optional push reminders; all three or none. Keys: npx web-push generate-vapid-keys
# VAPID_SUBJECT=mailto:you@example.com
# VAPID_PUBLIC_KEY=…
# VAPID_PRIVATE_KEY=…
```

`SERVER_SECRET` is what the server's decoy sign-in answers are derived from, so changing it
later changes them, which is the very thing they exist to hide. Pick it once.

## 3. The tunnel

In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel →
Cloudflared**. Name it, choose **Docker**, and copy the token from the command it shows
(the long string after `--token`) into `TUNNEL_TOKEN`.

Then add a **public hostname**:

- Subdomain and domain: where the planner will live, e.g. `planner.example.com`.
- Service: `HTTP`, URL `server:8787` (the Compose service name, not `localhost`).

## 4a. One origin (the app and the API through the tunnel)

```sh
docker compose --profile tunnel up -d --build
```

Open `https://planner.example.com`, create your account, and tick *Also create a sync
account* — the server address is already filled in, because this image's app looks for its
server wherever it was loaded from (`VITE_API_URL=same-origin`).

### Or run the published image instead of building

Every push to `master` publishes the image to the GitHub Container Registry
(`.github/workflows/docker.yml`) as `ghcr.io/adan-garcia/nweb:latest`, plus a
`sha-<commit>` tag for each commit and `1.2.3` / `1.2` for a `v1.2.3` git tag. To run that
rather than building on the server:

```sh
docker compose pull server
docker compose --profile tunnel up -d
```

Updating later is the same two commands. To stay on one version, set
`ENGINE_IMAGE=ghcr.io/adan-garcia/nweb:sha-<commit>` in `.env`.

A package published from a private repository is private too. Either sign the server in
once with a GitHub token that has `read:packages`
(`echo <token> | docker login ghcr.io -u <user> --password-stdin`), or make the package
public under the repository's **Packages → Package settings**.

## 4b. App on your own site, API through the tunnel

Point the tunnel's public hostname at something like `api.example.com`, set
`ALLOWED_ORIGINS` to your site's origin in `.env`, and start the server:

```sh
docker compose --profile tunnel up -d --build
```

Build the app for that server and upload `dist/` to the root of your site:

```sh
npm ci --ignore-scripts
VITE_API_URL=https://api.example.com npm run build
```

The address must be `https://` — the app refuses a plain-http server anywhere but
`localhost`, because a session token and a proof of the passphrase travel to it.

Your site then needs two things from its host:

1. **Every path that is not a file serves `index.html`** (it is a single-page app). On
   Netlify or Cloudflare Pages, a `_redirects` file in `dist/` with `/* /index.html 200`;
   on nginx, `try_files $uri /index.html;`; on Apache, a `FallbackResource /index.html`.
2. **`index.html`, `sw.js` and `manifest.webmanifest` are not cached**, and `/assets/*`
   may be cached forever (its file names change with their contents). Without the first,
   a deploy is not picked up until the old copy expires.

## 5. Checking it

- `https://planner.example.com/v1/push/key` answers with JSON: the API is reachable.
- Sign up, add some notes, then open the planner on a second device and choose *Sign in* with
  the same email and passphrase: the notes arrive.
- `docker compose logs server` shows `Listening on 8787.` and nothing alarming.

## Security notes

- **Nothing listens publicly but the tunnel.** Compose publishes the server on
  `127.0.0.1:8787` only, and Postgres not at all. Keep it that way: `CLIENT_IP_HEADER` is
  trusted because only the tunnel can reach the server; if port 8787 were open to the
  internet, anyone could set that header and name any address they liked to the rate limiter.
- **Registration.** Without `REGISTRATION_EMAILS`, anyone who finds the address can make an
  account and store data on your machine. Addresses are not verified by email, so the list
  is the only thing deciding who gets in.
- **The server cannot read your notes.** It stores ciphertext and the few plain fields a
  reminder needs (due dates and times). Losing it loses the sync copy, not the notes on your
  devices — but back up the `engine-db` volume if the server is the only other copy.
- **Rate limits are per process.** Run one server container.
- **Other tunnels** (ngrok, Tailscale Funnel, a reverse proxy) work the same way; set
  `CLIENT_IP_HEADER` to the header that proxy writes the caller's address into (usually
  `x-forwarded-for`, of which the server reads the last entry) and leave the server's port
  closed to everything else.
