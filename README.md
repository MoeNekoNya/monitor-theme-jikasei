# CF Server Monitor — Jikasei Theme

Vue 3 + Vite single-page theme for [CF-Server-Monitor](https://github.com/MoeNekoNya/CF-Server-Monitor).

## Development

Node.js 22.12+ is required (Node 24 recommended).

```bash
npm install
MONITOR_HUB=https://your-worker.example.com npm run dev
```

## Production build

```bash
npm run lint
npm test
npm run build
```

The generated `dist/` contains only `index.html` and `assets/`. For the CFSM custom-theme URL flow, do not bake a Worker URL into the build: CFSM serves the theme through its own Worker origin, and the frontend automatically uses that same origin. This keeps the theme reusable by any CFSM installation.

| Environment variable | Purpose |
| --- | --- |
| `API_BASE` | Optional only for standalone GitHub Pages hosting; leave unset for CFSM custom-theme hosting |
| `TITLE` | Static-host fallback title |
| `BACKGROUND_IMAGE` | Static-host fallback background image |
| `CSP_API` | Additional API origins for deployment CSP |
| `CSP_STATIC` | Additional static resource origins |

For a separately hosted theme, add its exact origin(s) to `CORS_ALLOWED_ORIGINS` on every Worker, comma-separated, with no paths or trailing slash.

## GitHub Pages deployment

The Deploy workflow builds on `main` / `master` and publishes `dist/` to the `dist` branch. It appends commits and does not force-push or recreate an existing branch. Set GitHub Pages to deploy from branch `dist`, folder `/`.

For the CFSM custom-theme URL workflow, no Actions secrets are required. In particular, do not set `API_BASE`: each CFSM Worker should provide its own same-origin API address at runtime. Optional static-host fallback settings can be configured separately if you intentionally publish a standalone Pages demo. Never put JWTs, API_SECRET, or Turnstile secret keys in Actions secrets.

## Runtime behavior

- Hash routes: `/#/` and `/#/server/:id`; the built-in admin page owns `/admin#/admin`.
- `GET /api/config` is cached per API origin; dashboard `GET /api/servers` is one-shot per page lifecycle.
- If Turnstile is enabled, first-time challenge verification performs one extra `/api/config` exchange to obtain the one-hour `turnstile_verified` credential. Without that handshake the reusable credential cannot be obtained from the documented API.
- Dashboard uses ID-filtered `subscribe=all`; detail uses a single-server WebSocket.
- Detail historical data, including latency and packet loss, comes from `GET /api/history/all`.
- Theme preferences are persisted through `POST /api/theme_options`, not local storage alone.

## Use from CF-Server-Monitor

1. Let the Deploy workflow publish the built `index.html` and `assets/` to the `dist` branch.
2. Copy the commit SHA of the latest commit on `dist`.
3. In CFSM Admin → Appearance → Custom Theme URL, paste:
   `https://github.com/MoeNekoNya/monitor-theme-jikasei/tree/<dist-commit-sha>`
4. Use Preview, then Apply. Do not use the source `master` branch URL; CFSM expects the built output at the repository root of the selected ref.
