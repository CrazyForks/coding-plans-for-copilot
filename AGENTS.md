# AGENTS Instructions

## Development Principles

- All scripts must implement the `-h` parameter.
- This project is implemented only for the current target version by default; do not keep compatibility code for old VS Code versions, old configurations, or old data structures.
- Price/plan information changes should be implemented by improving the fetch scripts first, not by directly editing `assets/*.json` data files (they are written by scripts only during script verification).

## Project Positioning

- This repository contains two parts:
  - VS Code extension (`src/`): multi-vendor model integration + Commit Message generation.
  - Price/performance dashboard (`pages/` + `assets/` + `scripts/`): displays coding plans and OpenRouter provider performance metrics.
- The core positioning of the VS Code extension is a general OpenAI Chat, OpenAI Responses, and Anthropic protocol adapter; request construction should prefer public/general protocol fields and avoid relying on Copilot-private request fields.
- Unlike native VS Code/Copilot Chat built-in endpoint requests, this extension must keep compatibility with OpenAI/Anthropic-style APIs reverse-proxied by Codex, Claude Code, etc.; do not sacrifice general compatibility to get closer to Copilot's private endpoint.
- Core dashboard data files:
  - `assets/provider-pricing.json` (domestic/structured plans)
  - `assets/openrouter-provider-metrics.json` (OpenRouter metrics)
  - `assets/openrouter-provider-plans.json` (OpenRouter provider plans and pending)

## Price Page Fetching

- When fetching vendor pricing pages or any price-related web content, prefer and actively use the Playwright MCP tool.
- For dynamically rendered pages, front-end rendered content, and flows that may have anti-scraping mechanisms, use Playwright MCP by default instead of direct HTTP fetching.
- Only fall back to non-browser requests when Playwright MCP is unavailable or browser capability is clearly not needed.
- If a page is accessible but cannot be parsed reliably, prefer adding a Playwright path (including necessary waits and interactions) before marking the vendor as pending.

## Data Fetching Order

- When updating pricing and metrics data, execute in the following order:
  1. `npm run pricing:fetch`
  2. `npm run metrics:fetch`
  3. `npm run openrouter:plans:fetch`
  4. `npm run serve:page` (local preview)
- `openrouter:plans:fetch` depends on the artifacts of the first two steps:
  - `assets/provider-pricing.json`
  - `assets/openrouter-provider-metrics.json`

## Script and Page Contracts

- `pages/app.js` depends on the following field structures; keep them compatible when modifying script output:
  - `provider-pricing.json`: `providers[].provider/plans/sourceUrls`, top-level `generatedAt/failures`
  - `openrouter-provider-metrics.json`: `generatedAt(Beijing)`, `captureWindow`, `config`, `models[]`, `failures`
  - `openrouter-provider-plans.json`: `providers[]`, `pending[]`, `summary`, `generatedAt(Beijing)`
- `scripts/serve-pricing-page.js` maps the following routes to `assets/` files:
  - `/provider-pricing.json`
  - `/openrouter-provider-metrics.json`
  - `/openrouter-provider-plans.json`
- Do not change the JSON paths above arbitrarily; if you must change them, update `pages/app.js` and `scripts/serve-pricing-page.js` accordingly.

## Environment Variables and Security

- `metrics:fetch` and `openrouter:plans:fetch` require `APIKEY` (OpenRouter API Key).
- Environment variables can be loaded from the `.env` file in the project root.
- When debugging the extension or doing manual API tests, you may reuse `BASE_URL`, `APIKEY`, `MODEL` from `.env`; treat them as local test parameters by default and do not commit them to the repository configuration.
- Never expose any secrets in documentation, logs, or commit messages.

## Code Map (Extension)

- Entries: `src/extension.node.ts` (Node.js host) and `src/extension.web.ts` (browser host); shared activation is in `src/extension.ts`.
- Configuration: `src/config/configStore.ts` (`coding-plans.vendors` normalization; new configs use `defaultApiStyle` / `models[].apiStyle`, `apiType` is only read for migration).
- Protocols and requests: `src/providers/genericProvider.ts`, `genericProviderProtocols.ts`; VS Code API adaptation: `lmChatProviderAdapter.ts`.
- Behavior and regression notes: see [DEV.md](DEV.md), [docs/testing.md](docs/testing.md); acceptance scenarios in [cases/](cases/) (non-automated; review or supplement before changing behavior).

## Development and Validation

| Change Scope | Minimum to Run |
| --- | --- |
| `src/` | `npm run typecheck`, `npm run lint`; `npm test` for behavior changes (includes `pretest` compile+lint) |
| `scripts/`, `pages/`, `assets/` contracts | Related `npm run pricing:fetch` / `metrics:fetch` / `openrouter:plans:fetch` + `npm run serve:page`; optional `npm run test:pages` |
| Publish extension | `npm run package:vsix`; see [DEV.md](DEV.md) for release and pre-release version conventions |

- Common commands: `compile` (typecheck+bundle), `package:vsix`, `test:unit`, `test:desktop`, `test:pages`.
- VSIX only packages allowlisted runtime entries `out/extension.node.js` and `out/extension.web.js` (see `.vscodeignore`); new runtime resources must be added to the packaging/esbuild config as well.

## Documentation Consistency

- When config items, script parameters, or default values change, check in sync:
  - `README.md` (English main doc)
  - `README.zh-CN.md` (Chinese)
  - `DEV.md`
  - `package.json` (contributes.configuration)
- If docs conflict with code, the code behavior wins, and fix the docs in the same change.
