# Multi-Account Kleinanzeigen Manager — PRD

## Origin
Existing GitHub project: `kleinanzeigen-bot-ui` (Next.js monolith, YAML file storage,
drives the Python `kleinanzeigen-bot` CLI). Extended in-place into a private
MULTI-ACCOUNT dashboard: ONE app user manages MANY Kleinanzeigen accounts.

## Core requirements (static)
- One app user → many isolated Kleinanzeigen accounts (own login/session, browser
  profile, ads, conversations). Number of accounts NOT hardcoded.
- Correct account/session routing: every KA operation targets exactly one account.
- Central inbox across all accounts; replies must use the originating account.
- Templates independent of accounts; publish through any selected account.
- Active ads across accounts; automatic republishing via existing scheduler.
- Mobile-first responsive; keep existing app auth; preserve the underlying bot.

## Architecture (implemented)
- **Account = isolated workspace** (reuses existing per-user workspace isolation).
  Default account maps to the app user's root workspace (backward compat, no file
  moves). Extra accounts live at `<userWorkspace>/accounts/<accountId>/` with own
  `config.yaml` (KA login), `.temp/browser-profile`, `ads/`, `downloaded-ads/`.
- **Registry**: `<userWorkspace>/accounts.yaml` (id, display_name, is_default,
  created/updated, last_sync, login_status, republish_default_days).
- **Account routing via `x-account-id` header** → `getCurrentUser` resolves the
  account sub-workspace and sets `user.workspace` (account-scoped) + `user.userWorkspace`
  (shared root). ALL existing routes become account-scoped with no per-route rewrite.
- **Templates** resolve to `user.userWorkspace` (shared across accounts).
- Run setup: Next.js on :3000 (frontend shim `/app/frontend/package.json`) + FastAPI
  reverse-proxy on :8001 (`/app/backend/server.py`) because Emergent routes /api→8001.

## What's implemented (2026-06)
- lib: `src/lib/accounts/accounts.ts` (model/registry/isolation/migration/CRUD).
- middleware: account-aware `getCurrentUser`.
- APIs: `/api/accounts` (GET/POST), `/api/accounts/[id]` (PATCH/PUT/DELETE),
  `/api/accounts/[id]/credentials` (GET/PUT), `/api/accounts/[id]/disconnect` (POST),
  `/api/accounts/overview` (aggregate dashboard), `/api/inbox` (unified messages).
- Templates decoupled to user workspace (templates + [slug] + from-template + ads POST).
- Frontend: AccountContext + switcher (header), Accounts page, multi-account Dashboard
  overview, central Inbox with per-account filters + correct-account reply routing.
- Nav: added Postfach (inbox) + Konten (accounts) links.
- Backend tested: 15/15 pass (account CRUD, isolation, x-account-id routing, template
  independence, aggregate endpoints, regression).

## Requires real testing (needs Python bot binary + real KA accounts)
- Live login/MFA, ad publish/update/delete/extend/republish, live message fetch/reply,
  scheduler-driven auto-republish. These are wired to the existing bot integration but
  the bot binary is not installed in this preview.

## Backlog / next
- P1: Explicit account picker in the publish flow (currently uses active account via switcher).
- P1: Persist `last_sync` on successful sync; surface unread counts once sessions exist.
- P2: Per-account automation settings UI (republish interval per ad) surfaced in Automations page.
- P2: Install/verify `kleinanzeigen-bot` binary for live automation.
