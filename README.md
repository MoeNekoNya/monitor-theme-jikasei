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
API_BASE=https://your-worker.example.com npm run build
```

The generated `dist/` contains only `index.html` and `assets/`. Runtime values are injected at build time and are not committed.

| Environment variable | Purpose |
| --- | --- |
| `API_BASE` | API origin(s), comma-separated |
| `TITLE` | Static-host fallback title |
| `BACKGROUND_IMAGE` | Static-host fallback background image |
| `CSP_API` | Additional API origins for deployment CSP |
| `CSP_STATIC` | Additional static resource origins |

For a separately hosted theme, add its exact origin(s) to `CORS_ALLOWED_ORIGINS` on every Worker, comma-separated, with no paths or trailing slash.

## GitHub Pages deployment

The Deploy workflow builds on `main` / `master` and publishes `dist/` to the `dist` branch. It appends commits and does not force-push or recreate an existing branch. Set GitHub Pages to deploy from branch `dist`, folder `/`.

Add Actions secrets as needed: `API_BASE`, `TITLE`, `BACKGROUND_IMAGE`, `CSP_API`, `CSP_STATIC`. Never put JWTs, API_SECRET, or Turnstile secret keys in these values.

## Runtime behavior

- Hash routes: `/#/` and `/#/server/:id`; the built-in admin page owns `/admin#/admin`.
- `GET /api/config` is cached per API origin; dashboard `GET /api/servers` is one-shot per page lifecycle.
- If Turnstile is enabled, first-time challenge verification performs one extra `/api/config` exchange to obtain the one-hour `turnstile_verified` credential. Without that handshake the reusable credential cannot be obtained from the documented API.
- Dashboard uses ID-filtered `subscribe=all`; detail uses a single-server WebSocket.
- Detail historical data, including latency and packet loss, comes from `GET /api/history/all`.
- Theme preferences are persisted through `POST /api/theme_options`, not local storage alone.