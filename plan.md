# Travel Trap Detector — Phase-by-Phase Build Guide (31 phases)

Stack: Next.js + React + Tailwind + shadcn/ui · Clerk · Inngest · Vercel AI SDK (Gemini) · Firecrawl · Stagehand on Browserbase · Pinecone (hosted `llama-text-embed-v2`) · Stream · Sarvam AI · Cloudflare R2 · Postgres + Prisma.
UI reference: the sidebar design canvas (28 screens). Schema reference: `schema.prisma`.

How to use this guide: do phases in order. Each phase is 1–3 hours of focused work, ends in something you can click, and has a "Done when" check. Phases marked **[MVP]** are the minimum to demo; the rest are the "missing features" layer. Commit after every phase.

## Phase map

| # | Phase | Group | Est. |
|---|---|---|---|
| 0 | Accounts and API keys | Setup | 1 h |
| 1 | Project scaffold | Setup | 1 h |
| 2 | Design tokens and shadcn components | UI | 2 h |
| 3 | Sidebar app shell | UI | 2 h |
| 4 | PWA | UI | 1 h |
| 5 | Database and Prisma | Data | 2 h |
| 6 | Clerk auth and user sync | Auth | 2 h |
| 7 | Roles and protected routes | Auth | 1 h |
| 8 | Seed data and directory | Data | 2 h |
| 9 | Tariff benchmarks and price engine | Core | 2 h |
| 10 | Price check screen | Core | 2 h |
| 11 | Explore map | Core | 2 h |
| 12 | Directory explore screen | Core | 1 h |
| 13 | Inngest setup | Agent | 1 h |
| 14 | Firecrawl research | Agent | 2 h |
| 15 | Stagehand + Browserbase capture and live preview | Agent | 4 h |
| 16 | Evidence vault | Agent | 2 h |
| 17 | Pinecone hosted embeddings | Agent | 3 h |
| 18 | AI SDK agent and tools | Agent | 3 h |
| 19 | Investigation workflow end to end | Agent | 3 h |
| 20 | Investigate form and live run screen | Agent | 3 h |
| 21 | Verdict page | Agent | 2 h |
| 22 | Community reports | Community | 3 h |
| 23 | Stream discussion and official findings | Community | 3 h |
| 24 | Assistant chat | AI | 3 h |
| 25 | Sarvam read-aloud | Voice | 3 h |
| 26 | Voice reporting and translation | Voice | 3 h |
| 27 | Moderation, workflows and knowledge admin | Admin | 4 h |
| 28 | Settings, usage, billing, notifications | Account | 3 h |
| 29 | Safety, limits and disclaimers | Quality | 2 h |
| 30 | Testing, deploy and demo | Ship | 3 h |

## From demo data to real data

- **Reports** come from travellers through `/reports/new` (Phase 22, voice in Phase 26). Moderators review them (Phase 27).
- **Properties, tariff boards and curated tariffs** are added by moderators in Phase 27 (the server actions already exist from Phase 8). Researched price ranges appear on their own and wait for moderator review.
- **Switching off demo data:** `npm run db:reset` removes every row flagged `isDemo` and reseeds. To launch without demo content, delete the demo rows (the same `resetDemo()` in `prisma/seed/index.ts`), do not reseed, and set the `demo_banner` app setting to `enabled: false`. Reference data (districts, places, plans, help, emergency contacts) is not demo and stays.

## Build status and decisions

| Phase | Status |
|---|---|
| 0 Accounts and keys | Done |
| 1 Scaffold | Done |
| 2 Design tokens and UI kit | Done (`/dev/ui`) |
| 3 Sidebar shell | Done |
| 4 PWA | Done (service worker registers in production builds only) |
| 5 Database | Done: 54 models, migrations `init` and `live_preview` (adds `WorkflowRun.browserSessionId`) |
| 6 Clerk auth and user sync | Done: webhook, first-sign-in sync |
| 7 Roles and protected routes | Done: `requireRole`, moderator-only pages, 403 page |
| 8 Seed data and directory | Done: `npm run db:seed` / `db:reset` (about 10 s), moderator directory actions, tested |
| 9 Tariff benchmarks and price engine | Done: `lib/price.ts` (40 unit tests), `/api/price`, tested against seeded data |
| 10 Price check screen | Done, then replaced by Price check v2 (below) |
| 10b Price check v2 | Done: any place via Mapbox, reverse routes, live web research with cited sources, distance estimate, Mapbox 3D maps |
| 11 Explore map | Done: Mapbox 3D map, layers, filters, search, nearby list, mobile bottom sheet; `GET /api/map` |
| 12 onwards | Open |

Decisions that override the original text below:

- **Model provider:** Google Gemini through the AI SDK (`@ai-sdk/google`, env `GOOGLE_GENERATIVE_AI_API_KEY`). No OpenAI or Anthropic key.
- **Embeddings:** Pinecone hosted inference, model `llama-text-embed-v2` (1024 dimensions). No separate embedding provider and no embedding calls from our code. The index is an *integrated* index (`createIndexForModel`), so we send text and Pinecone embeds it.
- **Browser automation:** Stagehand v3 on Browserbase, not raw Playwright. Stagehand drives the page; Browserbase hosts the session and provides the **live view**.
- **Live browser preview: doable.** Browserbase exposes a live view URL per session (`sessions.debug(sessionId).debuggerFullscreenUrl`) that can be embedded in an iframe, read-only. See Phases 15, 19 and 20.
- **File storage:** Cloudflare R2 through the S3 API (`R2_BUCKET`, `R2_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, `S3_ACCESS_KEY_SECRET`), not R2.
- **Webhook secret name:** `CLERK_WEBHOOK_SIGNING_SECRET`.
- **Package manager:** npm.

### Loading and empty states (applies to every phase from 7 on)

Every route that reads data ships with a loading state. No blank screens, no bare spinners.

1. Each `(app)` route segment gets a `loading.tsx` that renders a skeleton with the same layout as the page (header, cards, table rows) and a short caption that says what is loading, for example "Loading your investigations…".
2. Data that streams inside a page sits in its own `<Suspense fallback={...}>` with a skeleton of that block, so the rest of the page is usable.
3. Actions show progress in the button: spinner plus a verb ("Starting investigation…", "Generating speech…", "Submitting report…") and the button is disabled.
4. Long jobs (agent run, crawl, transcription) show the step name and the live timeline, never just a spinner.
5. Empty results use the shared empty-state component with a reason and a next action ("No reports yet. Submit the first one.").
6. Shared pieces live in `components/shell`: `LoadingState` (spinner plus text), `PageSkeleton`, `CardSkeleton`, `TableSkeleton`, `ListSkeleton`.

## Price check v2 (replaces the Phase 10 lookup)

A price check now works for any taxi route, stay, guide or tour. Every number keeps a source.

1. **Places:** curated places first, otherwise Mapbox (Geocoding v6 for towns, Search Box for airports and sights), bounded to north-east India. Found places are saved as `Place` rows (`source: "mapbox"`).
2. **Route:** Mapbox Directions with live traffic; a straight-line estimate (labelled "approx") if it fails.
3. **Range, first hit wins:**
   - Curated tariff (High confidence). Tariffs match in both directions.
   - Saved research (Medium), valid for 30 days, flagged `reviewStatus: "pending"` for the Phase 27 moderator queue.
   - Live research (Medium): Firecrawl search, Gemini extracts each price with the sentence it came from, code checks the sentence is on the page, promotional "starting from" prices are dropped, and at least 3 prices from 3 different sites must agree. Saved as a researched tariff with its sources.
   - Distance estimate for taxis (Low): per-km rates fitted from curated tariffs, labelled as an estimate, never "overpriced".
   - Otherwise "No reference", with the reason.
4. **Durable workflow (Inngest):** the server action only creates the check and sends the `price/check.requested` event. The `run-price-check` function (`src/inngest/functions/price-check.ts`) runs the steps: resolve places, route, find tariff, then (if needed) research gate, search pages, read each page in parallel (`read-page-N`), combine, save research, estimate, and a closing `finalize`. Every step retries on its own, a failing page is skipped instead of failing the run, and a per-user concurrency limit of 2 protects Firecrawl and Gemini. The step logic lives in `src/server/price-pipeline.ts` as plain JSON-in, JSON-out functions that also write `RunStep` and `RunEvent` rows for reloads.
5. **Live progress (Inngest Realtime):** each step publishes to the `price-run:<investigationId>` channel (`src/inngest/channels.ts`); the browser subscribes with `useRealtime` using a token minted by a server action that checks ownership. A slow `router.refresh()` every 6 s is only a fallback if a message is missed.
6. **Maps:** Mapbox GL with the Standard style, 3D terrain and a pitched view, in `components/map/mapbox-map.tsx`. Leaflet is removed; Phase 11 builds on the same component.
7. **Model:** Gemini via the AI SDK (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`, chosen for speed and free-tier limits).
8. **Tests:** `npm test` (unit), `npm run test:price-live` (live workflow; needs `npm run dev` and `npm run inngest:dev`; uses credits).

---

## Phase 0 — Accounts and API keys

**Goal:** every external service is ready before you write code, so no phase blocks on a signup.

**Deliverables**
- A `.env.local` file filled in, a `.env.example` committed with empty values.
- A password-manager entry for each key.

**Tech:** none yet.

**Keys to collect (where to get them)**

| Service | Where | What you copy | Env vars |
|---|---|---|---|
| Postgres | neon.tech (or supabase.com) | connection string | `DATABASE_URL` |
| Clerk | dashboard.clerk.com → create app → API keys | publishable + secret key; webhook signing secret | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` |
| Inngest | app.inngest.com → create app → Manage → Event Keys / Signing Key (not needed locally) | event key, signing key | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| LLM for AI SDK | aistudio.google.com | Gemini API key | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Firecrawl | firecrawl.dev → dashboard | API key | `FIRECRAWL_API_KEY` |
| Browserbase | browserbase.com → Settings | API key + project ID | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` |
| Pinecone | app.pinecone.io → API keys; create an integrated index with `llama-text-embed-v2` | API key, index name | `PINECONE_API_KEY`, `PINECONE_INDEX` |
| Stream | getstream.io → Chat → app dashboard | API key + secret | `NEXT_PUBLIC_STREAM_KEY`, `STREAM_SECRET` |
| Sarvam AI | dashboard.sarvam.ai | API subscription key | `SARVAM_API_KEY` |
| File storage | Cloudflare R2 (S3 API) | bucket, public URL, S3 access key and secret, account id | `R2_BUCKET`, `R2_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, `S3_ACCESS_KEY_SECRET`, `R2_ACCOUNT_ID` |
| Maps | mapbox.com → Access tokens (public token, URL-restricted) | public token | `NEXT_PUBLIC_MAPBOX_TOKEN` |

**How to proceed**
1. Sign up in the order above; use the free tiers.
2. Create `.env.example` with every variable name and no values.
3. Never prefix secrets with `NEXT_PUBLIC_`. Only the Clerk publishable key and Stream public key are public.
4. Check the free-tier limits of Browserbase, Firecrawl and Sarvam now; cap your demo usage accordingly.

**Done when:** all 12 values exist in `.env.local`.

---

## Phase 1 — Project scaffold

**Goal:** an empty Next.js app that deploys.

**Deliverables:** repo, Vercel project connected, preview URL live.

**Tech:** Next.js (App Router), TypeScript, Tailwind, pnpm, ESLint, Prettier.

**How to build**
1. `pnpm create next-app@latest travel-trap-detector --ts --tailwind --app --eslint`.
2. Add `src/` folders: `app/(app)`, `app/(auth)`, `app/api`, `components`, `lib`, `inngest`, `server`.
3. Add `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `sonner`, `next-themes`.
4. Add `lib/env.ts` that parses `process.env` with zod and throws on missing values.
5. Push to GitHub, import into Vercel, add env vars there too.

**Done when:** the Vercel preview URL shows the default page and `env.ts` passes.

---

## Phase 2 — Design tokens and shadcn components

**Goal:** the Resonance-like look exists as reusable components.

**Deliverables:** tokens in `globals.css`, shadcn components installed, a `/dev/ui` page showing them.

**Tech:** shadcn/ui, Radix, Geist font, Tailwind v4 theme variables.

**How to build**
1. `pnpm dlx shadcn@latest init`; choose neutral base.
2. Add: button, input, textarea, select, tabs, card, badge, dialog, sheet, dropdown-menu, tooltip, table, progress, slider, switch, toast (sonner), skeleton, scroll-area, avatar, separator.
3. Set tokens to the design: background white, border `#ececec`, muted `#8a8a8a`, soft `#f7f7f7`, teal accent `#2b7f78`, radius 12px, soft 1px shadows.
4. Add status colors as semantic badge variants: ok, warning, info, danger.
5. Create custom components from the design: `StatCard`, `OrbCard` (gradient circle card), `StepTimeline`, `ToolChip`, `Waveform`, `PriceRange`, `EvidenceCard`.
6. Load Geist with `next/font`.

**Done when:** `/dev/ui` shows every component in light mode and matches the canvas.

---

## Phase 3 — Sidebar app shell **[MVP]**

**Goal:** every screen lives inside the sidebar layout.

**Deliverables:** desktop sidebar, top bar with Feedback and Need help pills, mobile drawer, bottom tab bar on mobile, usage card, user menu.

**Tech:** shadcn `Sheet` for the drawer, `usePathname` for active state.

**How to build**
1. Create `app/(app)/layout.tsx` with `<Sidebar/>` (256px) and `<Topbar/>`.
2. Nav config in `lib/nav.ts`: Dashboard, Investigate, Price check, Assistant, Voice, Explore map, Community, Directory, Evidence vault; Others: Settings, Help; Moderator group visible only to moderators (Phase 7).
3. Active item: soft background plus inset border.
4. Below `md`, hide the sidebar; show a hamburger that opens the same nav in a `Sheet`, plus a 5-item bottom bar (Home, Check, Assistant, Reports, More).
5. Add empty placeholder pages for all routes so links work.

**Done when:** every nav item routes, the layout holds at 390px and 1440px.

---

## Phase 4 — PWA

**Goal:** installable app that opens offline.

**Deliverables:** manifest, icons (192, 512, maskable), service worker, offline page, install prompt.

**Tech:** `app/manifest.ts`, hand-written `public/sw.js` or Serwist.

**How to build**
1. Add `manifest.ts` with name, `display: "standalone"`, theme color, icons.
2. Service worker: precache the shell and `/offline`; network-first for pages; never cache `/api` or authenticated data.
3. Register the worker in a client component; handle the `beforeinstallprompt` event for an Install button.
4. Test with Chrome DevTools → Application → Manifest and Lighthouse.

**Done when:** Lighthouse PWA checks pass and airplane mode shows the offline page.

---

## Phase 5 — Database and Prisma **[MVP]**

**Goal:** the schema is live and typed.

**Deliverables:** `prisma/schema.prisma`, first migration, `lib/db.ts` singleton, Prisma Studio working.

**Tech:** PostgreSQL (Neon/Supabase), Prisma.

**Key:** `DATABASE_URL` (Phase 0).

**How to build**
1. `pnpm add prisma @prisma/client`; copy the delivered `schema.prisma` into `prisma/`.
2. `pnpm prisma migrate dev --name init`.
3. Create `lib/db.ts` with the global-singleton pattern so hot reload does not open many connections.
4. On Neon, use the pooled URL for the app and the direct URL for migrations (`directUrl`).
5. Run `pnpm prisma studio` and confirm all tables.

**Done when:** you can create and read a `Workspace` row from a test script.

---

## Phase 6 — Clerk auth and user sync **[MVP]**

**Goal:** sign in, sign out, and a matching `User` row.

**Deliverables:** `/sign-in`, `/sign-up`, middleware, webhook that mirrors users, workspace auto-created on first login.

**Tech:** `@clerk/nextjs`, Svix (via Clerk webhooks).

**Keys:** Clerk publishable, secret, webhook signing secret.

**How to build**
1. Wrap `app/layout.tsx` in `<ClerkProvider>`.
2. `middleware.ts` with `clerkMiddleware`; public routes: `/`, `/sign-in`, `/sign-up`, `/offline`, `/api/inngest`, `/api/webhooks/*`.
3. Style the sign-in page to match the canvas (centered card on soft background); use Clerk `appearance` to match tokens.
4. Create `app/api/webhooks/clerk/route.ts`; verify with `verifyWebhook` from `@clerk/nextjs/webhooks`; handle `user.created`, `user.updated`, `user.deleted` → upsert `User` and create "My trips" `Workspace` + `Membership`.
5. In development expose the webhook with `ngrok` or Clerk's dev tunnel; add the URL in Clerk → Webhooks and copy the signing secret.
6. Add a `getCurrentUser()` helper that reads `auth()` then loads the `User`.

**Done when:** signing up creates a `User`, `Workspace` and `Membership` row.

---

## Phase 7 — Roles and protected routes **[MVP]**

**Goal:** moderator pages are inaccessible to travellers.

**Deliverables:** role in Clerk public metadata, guard helper, hidden nav group, 403 page.

**Tech:** Clerk `publicMetadata.role`, Next.js middleware, server checks.

**How to build**
1. In the Clerk dashboard set your own user's public metadata `{ "role": "MODERATOR" }`.
2. Webhook copies the role into `User.role`.
3. `requireRole("MODERATOR")` helper used in every moderator page and server action; do not rely on hiding the nav only.
4. In middleware, protect `/moderation`, `/workflows`, `/knowledge` for non-moderators.

**Done when:** a traveller account gets 403 on `/moderation`; your moderator account sees it.

---

## Phase 8 — Seed data and directory **[MVP]**

**Goal:** realistic demo data so every screen has content.

**Deliverables:** `prisma/seed.ts` with synthetic `.example` properties, tariffs, reports; directory server actions.

**Tech:** Prisma seed, Zod.

**How to build**
1. Create 30–40 properties across Assam and Meghalaya (use `.example` domains and fake phone numbers; do not use real businesses).
2. Create 25 tariff rows (airport→city, city→sightseeing, by vehicle).
3. Create 15 reports with mixed statuses and 3 official findings.
4. Moderator server actions: create / edit / verify / delete property.
5. Add `pnpm db:seed` and `pnpm db:reset`.

**Done when:** `pnpm db:reset` gives a fully populated database in under a minute.

---

## Phase 9 — Tariff benchmarks and price engine **[MVP]**

**Goal:** a pure function that classifies a quote.

**Deliverables:** `lib/price.ts` with unit tests, `/api/price` route.

**Tech:** TypeScript, Vitest.

**How to build**
1. Normalise a route key: lowercase, strip punctuation, `origin|destination|vehicle`.
2. Lookup benchmark; fall back to fuzzy match on destination; return `NO_REFERENCE` if none.
3. Band rules: below low → `BELOW_RANGE`; ≤ high → `WITHIN_RANGE`; ≤ 1.25 × high → `ABOVE_RANGE`; else `WELL_ABOVE_RANGE`.
4. Return `{ band, low, high, percentOverHigh, benchmarkId, effectiveOn }`.
5. Tests for each band, missing route, and boundary values.

**Done when:** all tests pass.

---

## Phase 10 — Price check screen **[MVP]**

**Goal:** the price result design works with real data.

**Deliverables:** form, result card with range slider visual, route mini-map, "Why this range" card, Read aloud button (wired in Phase 25).

**Tech:** React Hook Form + Zod, Mapbox (superseded by Price check v2).

**Key (optional):** `ORS_API_KEY` for distance and route geometry; otherwise estimate with the haversine formula and label it "approx".

**How to build**
1. Tabs: Taxi / Stay / Guide / Tour with different fields.
2. Place inputs: a searchable list from the directory and a free-text fallback.
3. Server action calls the price engine, saves `PriceCheck` under an `Investigation` of kind `PRICE`.
4. Range visual: a track with the usual range highlighted and a marker for the quote.
5. Show the benchmark source and date in the footer.

**Done when:** a Rs 4,800 airport taxi quote shows "Well above range".

---

## Phase 11 — Explore map

**Goal:** report and property pins on a map.

**Deliverables:** `/map` with layers, search, side list, mobile bottom sheet.

**Tech:** Mapbox GL (`components/map/mapbox-map.tsx`, Standard style, 3D terrain), token `NEXT_PUBLIC_MAPBOX_TOKEN`.

**How to build**
1. Load the shared `MapboxMap` with `dynamic(..., { ssr: false })` (see `MapboxMapLazy`).
2. Marker colors: red report, green verified property, amber tariff dispute, blue tariff board.
3. Query `/api/map?bbox=...&layers=...` and return GeoJSON-like rows.
4. Click a pin → show card with link to the report or property.
5. Respect OSM tile usage policy (attribution; low traffic) or switch to MapTiler for the demo.

**Done when:** panning the map reloads pins and the list on the right matches.

---

## Phase 12 — Directory explore screen

**Goal:** the Resonance-style card grid.

**Deliverables:** `/directory` grid with category tabs, search, verified filter, detail drawer.

**Tech:** server components, URL search params for filters.

**How to build**
1. `OrbCard` shows gradient orb, name, type · district and verified badge; each property gets a stable orb color from its id.
2. Tabs map to `ServiceType`; search is `contains` on name/domain.
3. Click opens a drawer with address, phone, reports linked to the property, and "Check a price" button.

**Done when:** filters persist in the URL and survive refresh.

---

## Phase 13 — Inngest setup (done early, with Price check v2)

**Goal:** durable background workflows run locally and in production.

**Status:** the client (`src/inngest/client.ts`), typed event (`events.ts`), Realtime channel (`channels.ts`), `/api/inngest` route and the `run-price-check` workflow exist. Run `npm run inngest:dev` next to `npm run dev`. Still to do here: `report/submitted`, `source/sync.requested`, `voice/transcribe.requested`, and syncing the app in Inngest Cloud after deploy.

**Deliverables:** Inngest client, `/api/inngest` route, a hello-world function, events typed.

**Tech:** `inngest` package.

**Keys:** none locally; `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production.

**How to build**
1. `pnpm add inngest`; create `inngest/client.ts` with typed event schemas (`investigation/requested`, `report/submitted`, `source/sync.requested`, `voice/transcribe.requested`).
2. `app/api/inngest/route.ts` using `serve` from `inngest/next`.
3. Run `npx inngest-cli@latest dev` next to `pnpm dev`; open localhost:8288.
4. Write `helloWorld` with two `step.run` calls and trigger it from a button.
5. In production, sync the app URL in the Inngest dashboard after deploy.

**Done when:** the dev dashboard shows a completed run with both steps.

---

## Phase 14 — Firecrawl research **[MVP]**

**Goal:** fetch public pages as clean text with URL and timestamp.

**Deliverables:** `server/research.ts` with `searchWeb(query)` and `scrapeUrl(url)`, results saved as `Source` rows.

**Tech:** `@mendable/firecrawl-js`.

**Key:** `FIRECRAWL_API_KEY`.

**How to build**
1. `searchWeb` calls Firecrawl search (limit 5) with the business name + district; `scrapeUrl` requests markdown.
2. Always store `{ url, title, snippet, retrievedAt }`; never present a fact without its URL.
3. Add a domain allow/deny list (skip social login walls, never crawl private pages).
4. Truncate scraped text to a token budget before it goes to the model.
5. Wrap calls with timeout and retry; treat failures as "source unavailable", not as evidence.

**Done when:** a test script returns three sources with URLs and times for a seeded property.

---

## Phase 15 — Browserbase evidence capture with Stagehand and live preview

**Goal:** a timestamped screenshot of the page being checked, captured by a Stagehand-driven Browserbase session, with a live view the traveller can watch while it runs.

**Deliverables:** `server/capture.ts` that opens a Browserbase session through Stagehand, loads the URL, saves a PNG, returns metadata, and exposes the live view URL; `/api/investigations/[id]/live` that returns a fresh live view URL for a running session.

**Tech:** `@browserbasehq/stagehand` (v3), `@browserbasehq/sdk` (for `sessions.debug`), Cloudflare R2 via the S3 API (`@aws-sdk/client-s3`).

**Keys:** `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `GOOGLE_GENERATIVE_AI_API_KEY` (Stagehand's model, `google/gemini-...`), R2 variables.

**Live preview: doable.** Browserbase's `sessions.debug(sessionId)` returns `debuggerFullscreenUrl`, an embeddable page that mirrors the remote browser in real time. Embed it as an iframe (`sandbox="allow-same-origin allow-scripts"`, `pointer-events: none` so it is read-only). The session emits a `browserbase-disconnected` message when it ends, which the UI uses to swap the iframe for the final screenshot. Each tab has its own URL; we only use the first page.

**How to build**
1. `new Stagehand({ env: "BROWSERBASE", model: "google/<gemini model>", browserbaseSessionCreateParams: { projectId, browserSettings: { viewport: { width: 1280, height: 800 } } } })`, then `await stagehand.init()`. Verify the option names against the installed Stagehand types (Appendix D).
2. Right after `init()`, read the session id, store it on `WorkflowRun.browserSessionId`, and write a `RunEvent` of type `browser_session_started`. The live screen can now ask for the live view URL.
3. Navigate deterministically with `page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 })`. Use `stagehand.observe()` / `stagehand.extract()` only to read (listing text, price, payment instructions), never `act()` on forms.
4. **Read-only by policy.** The agent never types into inputs, submits forms or clicks pay/confirm buttons. Allowed actions: scroll, open a link on the same site, switch tabs. Enforce this in the Stagehand instructions and by only exposing read tools. Block non-http(s) schemes and private IP ranges before `goto` (Phase 29 helper).
5. Emit a `RunEvent` for each action (`page_navigated`, `page_scrolled`, `page_read`, `page_captured`) with a one-line message, so the timeline shows what the agent is doing next to the live view.
6. Screenshot the viewport at 1280×800 (optionally the payment-step page when the URL path suggests it), upload to R2, insert an `Evidence` row with `url`, `capturedAt`, `browserSessionId`, `width`, `height`, `capturedBy: "browserbase"`.
7. Always `await stagehand.close()` in `finally` so idle sessions are not billed. If capture fails, mark the step FAILED and continue with lower confidence.
8. Live view URLs are tied to the session, so do not store them. `GET /api/investigations/[id]/live` checks that the caller owns the investigation, calls `sessions.debug`, and returns the URL only while the run is RUNNING.

**Done when:** a seeded URL produces a screenshot in R2 and an `Evidence` row, and while it runs the live view URL shows the remote browser moving.

---

## Phase 16 — Evidence vault

**Goal:** browse every capture and upload.

**Deliverables:** `/evidence` grid with filters, detail viewer, download, manual upload.

**Tech:** R2 presigned URLs, `react-dropzone`.

**How to build**
1. Grid cards show thumbnail, title, subject, timestamp and type badge.
2. Uploads: client upload to R2 with an authenticated token route; limit 8 MB images.
3. Detail view shows URL, captured time, linked investigation or report.
4. "Download all" zips selected files server-side (optional).

**Done when:** uploading an image makes it appear in the grid and in a report attachment picker.

---

## Phase 17 — Pinecone with hosted embeddings **[MVP]**

**Goal:** semantic search over tariffs, directory entries, advisories and past reports, with Pinecone doing the embedding.

**Deliverables:** an integrated Pinecone index, ingest function, `retrieve(query, filter)` helper, knowledge sources recorded in the DB.

**Tech:** `@pinecone-database/pinecone`. Embeddings come from Pinecone's hosted inference model **`llama-text-embed-v2`** (1024 dimensions by default; 2048, 768, 512 and 384 also supported). Our code never calls an embedding API.

**Keys:** `PINECONE_API_KEY`, `PINECONE_INDEX`.

**How to build**
1. Create the index once with `createIndexForModel({ name, cloud: "aws", region: "us-east-1", embed: { model: "llama-text-embed-v2", fieldMap: { text: "chunk_text" } }, waitUntilReady: true })`. The `fieldMap` names the record field Pinecone embeds.
2. Chunk documents to about 300–500 tokens. Keep the chunk text in `VectorRecord.text` (our DB is the source of truth) and also send it as `chunk_text` so Pinecone can embed it.
3. Upsert with `index.namespace(ns).upsertRecords([{ _id, chunk_text, url, title, type, district, retrievedAt, docId }])`. The `_id` is `{documentId}:{chunkIndex}`, so re-syncs overwrite instead of duplicating. Note: integrated indexes do not support updating or importing with text, so always re-upsert whole records.
4. `retrieve()` calls `index.namespace(ns).searchRecords({ query: { topK: 5, inputs: { text }, filter }, fields: [...] })` with a metadata filter (district, type). Optionally add a rerank (`bge-reranker-v2-m3`) for the final top 5. Return text plus source fields from our DB.
5. Use one namespace per knowledge type (`tariffs`, `directory`, `advisories`, `reports`) so the Knowledge screen can show per-source counts and the assistant can scope searches.
6. Write an Inngest function `source/sync.requested` that crawls with Firecrawl → chunks → upserts records → updates `KnowledgeSource.status`.
7. Multilingual: `llama-text-embed-v2` is multilingual, so Assamese and Hindi queries can be sent as-is; still translate to English with Sarvam when recall is poor.

**Done when:** "taxi fare Shillong airport sedan" returns the seeded tariff chunk with its URL.

---

## Phase 18 — AI SDK agent and tools **[MVP]**

**Goal:** a tool-calling agent that returns typed output.

**Deliverables:** `server/agent.ts` with tools and a Zod verdict schema; unit test with mocked tools.

**Tech:** Vercel AI SDK (`ai`, `@ai-sdk/google`), Zod. Model: a Gemini model chosen at build time (check the current id in Appendix D).

**Key:** `GOOGLE_GENERATIVE_AI_API_KEY`.

**How to build**
1. Define tools with `tool({ description, inputSchema, execute })`:
   - `searchWeb` (Firecrawl), `scrapePage` (Firecrawl), `capturePage` (Stagehand on Browserbase, read-only), `retrieveKnowledge` (Pinecone), `lookupDirectory` (Prisma), `comparePrice` (price engine), `findSimilarReports` (Prisma + Pinecone).
2. Define the output schema: `verdict`, `concern`, `confidence`, `summary`, `signals[]` (title, detail, strength), `guidance[]`, `sources[]` (url, retrievedAt).
3. System prompt rules: use only tool results as evidence; cite a source for every claim; say "inconclusive" when evidence is thin; never accuse a named person or business of a crime; verdicts are signals, not legal findings.
4. Use `generateObject` for the final step; use `streamText` with `maxSteps` / stop condition while gathering evidence.
5. Record every tool call into `ToolCall` rows (args, output, ms) from `onStepFinish`.
6. Keep prompts versioned (`promptVersion`) and store model id with each result.

**Done when:** running the agent on the seeded fake URL returns a valid object with at least two sources.

---

## Phase 19 — Investigation workflow end to end **[MVP]**

**Goal:** one Inngest function orchestrates the whole run.

**Deliverables:** `investigation/requested` function with six steps, events written to `RunEvent`, results saved.

**Tech:** Inngest `step.run`, Prisma, the modules from Phases 14–18.

**How to build**
1. Steps: `parse-input` → `search-sources` → `capture-page` → `retrieve-benchmarks` → `analyse` → `finalise`.
2. At the start and end of each step update `RunStep` and insert a `RunEvent` (`research_started`, `sources_found`, `page_captured`, `benchmark_calculated`, `analysis_completed`).
3. Configure retries (3) and a per-step timeout; a capture failure should not fail the run (mark step `FAILED`, continue with lower confidence).
4. `finalise` writes `InvestigationResult`, `Signal`, `Source`, `ReportMatch`, increments `UsageRecord`, creates a `Notification`.
5. Add `cancelOn` for `investigation/cancelled`.
6. Add concurrency limit per user (1–2) to protect third-party quotas.
7. In `capture-page`, store `browserSessionId` on the `WorkflowRun` as soon as the Stagehand session exists and emit `browser_session_started`; clear nothing at the end (the id stays for the replay link). Emit one `RunEvent` per browser action so the live screen can narrate it.

**Done when:** sending the event from a script produces a complete result and six step rows.

---

## Phase 20 — Investigate form and live run screen **[MVP]**

**Goal:** the user watches the agent work.

**Deliverables:** `/investigate` form, `/investigate/[id]` live timeline, preview pane, sources list.

**Tech:** server action to create the row and send the Inngest event; Server-Sent Events route or short polling; React Query.

**How to build**
1. Form tabs: Link / Business name / Message / Phone or UPI; option chips for research, capture, knowledge, price.
2. Server action: validate, check usage limit, create `Investigation` (QUEUED), `inngest.send`, redirect to the run page.
3. `GET /api/investigations/[id]/events` streams `RunEvent` rows after a `lastId` cursor over SSE (poll the DB every 1 s on the server side). If SSE is hard on your host, poll every 2 s with React Query.
4. `StepTimeline` renders step state (done / running / waiting / retrying) plus tool chips.
4a. **Live preview pane (doable).** While the run is RUNNING and has a `browserSessionId`, the right-hand "Live preview" card fetches `/api/investigations/[id]/live` and embeds the returned live view URL in a read-only iframe, with the current page URL and the latest action line under it ("Opening listing page…", "Reading payment instructions…"). Before the session exists it shows a skeleton with the text "Starting a secure browser…". On the `browserbase-disconnected` message, or when the run finishes, it swaps to the final screenshot with "Captured at hh:mm:ss · 1280 x 800". If the live view fails to load it falls back to the screenshot and the timeline; a failed preview never fails the run.
5. When status is `COMPLETED`, redirect to the verdict.

**Done when:** submitting a link shows steps ticking live and ends on the verdict page.

---

## Phase 21 — Verdict page **[MVP]**

**Goal:** the result screen with evidence and clear next steps.

**Deliverables:** verdict banner, "why flagged" list, evidence grid, sources, guidance card, map card, follow-up chat dock, export.

**Tech:** server components, `react-pdf` or print stylesheet for export (optional).

**How to build**
1. Banner colors follow verdict: danger, warning, success, neutral; always show confidence and the "signal, not a legal finding" note.
2. Signals sorted by strength; each links to its source.
3. Evidence cards open the vault viewer.
4. Guidance always includes: don't pay in advance to personal accounts, call 1930, cybercrime.gov.in.
5. "Report this" pre-fills a report with the URL and evidence.
6. Share link only for the owner unless they toggle public.

**Done when:** the demo suspicious URL shows all sections with real data.

---

## Phase 22 — Community reports

**Goal:** submit, list and follow reports.

**Deliverables:** `/reports` table, `/reports/new` form, `/reports/[ref]` detail, status history, attachments, follow button.

**Tech:** React Hook Form, Zod, Prisma, Inngest `report/submitted`.

**Location:** the form asks for a district and a place. The place box uses the same Mapbox suggestions as the price check (`components/price/place-input.tsx`) and saves `lat`, `lng` and `locationText` on the report. That is what puts a report on the Explore map (`/map` shows public reports that have coordinates). Reports without a place still appear in the list, just not on the map.

**How to build**
1. Reference generator: `TTD-` + 6 characters from an unambiguous alphabet.
2. Anonymous-by-default toggle; store `userId` but hide it publicly.
3. On submit send `report/submitted`; the function runs duplicate detection (same URL or UPI in other reports + Pinecone similarity) and writes `autoCheck`.
4. Status machine: NEW → UNDER_REVIEW → VERIFIED / RESOLVED / CLOSED / REJECTED, each change adds a `ReportStatusEvent` and a notification to followers.
5. Public detail separates "Reporter allegation" (labelled "Not verified") from "Official finding" (green, moderator only).
6. Rate-limit submissions per user (see Phase 29).

**Done when:** a new report appears in the list with an auto-check summary.

---

## Phase 23 — Stream discussion and official findings

**Goal:** a moderated discussion under each report.

**Deliverables:** Stream channel per report, comment list, moderator badge, flagged comment handling, message mirror in DB.

**Tech:** `stream-chat`, `stream-chat-react` (or custom UI with the Stream React hooks).

**Keys:** `NEXT_PUBLIC_STREAM_KEY`, `STREAM_SECRET`.

**How to build**
1. Server route `/api/stream/token` creates a Stream user token for the signed-in user (`serverClient.createToken(userId)`); upsert the Stream user with name and role.
2. When a report is created, create channel `messaging:report-{ref}` (type `livestream` or custom) with members open to signed-in users; store `streamChannelId`.
3. Moderators get channel role `channel_moderator`; show an "Official" badge based on user role.
4. Stream webhook (`message.new`) → mirror into `Comment` for search and audit.
5. Enable Stream moderation or a simple banned-words list; flagged messages enter the moderation queue.
6. Keep the official finding in your DB and render it above the chat, never as a chat message.

**Done when:** two accounts see each other's messages live and the moderator message shows the badge.

---

## Phase 24 — Assistant chat

**Goal:** a multilingual assistant that can answer and start investigations.

**Deliverables:** `/assistant` with history, language chips, citations, voice input button, tool chips, "open live run" card.

**Tech:** AI SDK `useChat` + `streamText` route, same tools as Phase 18, Stream for threaded history (optional) or your own `ChatThread` tables.

**How to build**
1. `/api/chat` route: `streamText({ model, tools, system, messages })` and return `toUIMessageStreamResponse()` (check your AI SDK version for the exact helper).
2. Tools: `retrieveKnowledge`, `comparePrice`, `lookupDirectory`, `startInvestigation` (creates the row and sends the Inngest event, returns the id so the UI shows a live-run card).
3. Language: detect the user language, answer in the same language (Assamese, Hindi, English). For weaker languages translate through Sarvam before and after.
4. Persist messages to `ChatMessage` in `onFinish`; keep citations as JSON.
5. Per-investigation follow-up: when opened from a verdict, pre-load result context into the system prompt.
6. Guardrails: refuse to guess; cite or say "I don't know".

**Done when:** an Assamese question about taxi fares returns the right range with a source chip.

---

## Phase 25 — Sarvam read-aloud

**Goal:** any verdict, price result or advisory can be spoken in Assamese, Hindi or English.

**Deliverables:** `/voice` screen (text area, language and voice selects, waveform player, settings sliders, history), "Read aloud" buttons elsewhere.

**Tech:** Sarvam text-to-speech REST API called from a server route; audio stored in R2; Web Audio / `wavesurfer.js` for the waveform.

**Key:** `SARVAM_API_KEY` (dashboard.sarvam.ai). Check Sarvam's docs for the current TTS model name, supported language codes (for example `as-IN`, `hi-IN`, `en-IN`), speaker names and request limits, because they change.

**How to build**
1. `POST /api/voice/tts` → validate text length, call Sarvam TTS with `{ text, target_language_code, speaker, pace, ... }`, decode the base64 audio in the response, upload it, create a `VoiceJob`.
2. Cache by hash of `(text, lang, voice, pace)` to avoid paying twice.
3. UI mirrors your reference: big text area, bottom bar with language and voice dropdowns and a dark "Generate" button, player with waveform and timer, right panel with Settings (pace, pitch, loudness sliders) and History tabs, toast "Audio ready".
4. Translate first when the text language differs from the chosen output language (Phase 26 helper).
5. Chunk long text into sentences under the API limit and concatenate the audio.

**Done when:** an English verdict plays back in Hindi and appears in History.

---

## Phase 26 — Voice reporting and translation

**Goal:** speak a report in Assamese and get an editable transcript plus English version.

**Deliverables:** recorder component, transcription job, translation helper, transcript editor in the report form.

**Tech:** `MediaRecorder` API, Sarvam speech-to-text and translation APIs, Inngest `voice/transcribe.requested`.

**Key:** `SARVAM_API_KEY`. Verify the current STT model, accepted audio formats, maximum clip length and translate endpoint in Sarvam's docs.

**How to build**
1. Record in the browser (`audio/webm`); show timer and live waveform from an `AnalyserNode`.
2. Upload the clip to R2, create `VoiceJob (STT)`, send the Inngest event.
3. Function: convert to a supported format if needed (ffmpeg on a worker if the API rejects webm), call STT with `language_code: "unknown"` for auto-detect, then call translate to English; store `text` and `translated`.
4. UI polls the job; when done fill the transcript box and keep the audio as a report attachment.
5. Always let the user edit the transcript before submit; keep both original and translation.
6. Ask for microphone permission only when the user taps the mic; handle denial gracefully.

**Done when:** a 20-second Assamese clip becomes an editable transcript with an English translation.

---

## Phase 27 — Moderation, workflows and knowledge admin

**Goal:** the three moderator-only screens.

**Deliverables:**
- `/moderation`: queue table with priority, filters, review drawer (status select, note to reporter, publish official finding), flagged comments tab, directory tab.
- `/workflows`: run list from Inngest events mirrored in DB, KPIs, event stream.
- Directory and tariff tabs in `/moderation`: forms for the existing `createPropertyAction` / `updatePropertyAction` / `verifyPropertyAction` / `deletePropertyAction` (Phase 8), a place picker that sets the pin, plus create and edit for tariff boards and curated tariffs, and a review queue for researched tariffs (`reviewStatus: pending`). This is how real properties and tariff boards replace the demo ones.
- `/knowledge`: sources table, add source, re-sync button, test-a-query box with scores.

**Tech:** shadcn table + sheet, server actions, Inngest REST API or your own `RunEvent` tables, Pinecone query for the test box.

**How to build**
1. Every action calls `requireRole("MODERATOR")` and writes a `ModerationAction` + `AuditLog`.
2. Publishing a finding creates `OfficialFinding`, updates status, notifies followers.
3. Workflow KPIs come from your own tables (counts by status/day) so you do not depend on Inngest's API; add a "Open in Inngest" link.
4. "Add source" → create `KnowledgeSource` → send `source/sync.requested`.
5. Query box calls `retrieve()` and shows score, source and chunk text.

**Done when:** a moderator can take a NEW report to VERIFIED with a published finding, and the traveller sees it.

---

## Phase 28 — Settings, usage, billing and notifications

**Goal:** account features around the core.

**Deliverables:** settings tabs (profile, language and voice, notifications, privacy), usage meters, plan page, notification bell, email-free in-app notifications.

**Tech:** Clerk `<UserProfile/>`, Clerk Billing (optional), Prisma `UsageRecord`, `Subscription`, `Notification`.

**Keys:** Clerk Billing needs a payment provider connected in the Clerk dashboard (Stripe in test mode). Skip billing entirely for the hackathon if time is short; keep the plan page read-only.

**How to build**
1. Settings save preferences to `User` (language, voice, auto-read).
2. Usage: increment on investigation completion and voice generation; show progress bars in the sidebar card and plan page.
3. Enforce limits in server actions (Phase 29 helper).
4. Plans: map Clerk plan ids to `PlanTier`; webhook updates `Subscription`.
5. Notification bell: unread count, list, mark as read; created by Inngest functions.

**Done when:** changing language in settings changes the assistant reply language and the usage bar moves after a run.

---

## Phase 29 — Safety, limits and disclaimers

**Goal:** the app cannot be abused and does not overclaim.

**Deliverables:** rate limits, input validation, SSRF protection, content rules, legal copy.

**Tech:** Upstash Ratelimit (free tier) or a DB counter; Zod; `ipaddr.js`.

**Key (optional):** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` from upstash.com.

**How to build**
1. Rate limits: investigations 10/hour/user, reports 5/day, TTS 30/day, chat 60/hour.
2. URL safety: allow http/https only; resolve DNS and block private, loopback and link-local ranges before any server-side fetch or capture.
3. Treat all scraped text as untrusted: wrap it in delimiters in prompts and tell the model it may contain instructions to ignore (prompt-injection defence).
4. Never display accusations as fact: label allegations "Not verified"; verdict text must say "signal, not a legal finding".
5. Redact phone numbers and UPI IDs of private individuals in public views; show full values only to moderators.
6. Add Terms, Privacy and an emergency box (1930, cybercrime.gov.in) to Help and the footer.
7. Add a "Demo data" banner while seeded data is used.

**Done when:** a private-IP URL is rejected and the 11th investigation in an hour is blocked with a clear message.

---

## Phase 30 — Testing, deploy and demo

**Goal:** a stable public demo and a 3-minute story.

**Deliverables:** passing tests, production deploy, seeded demo account, demo script, backup video.

**Tech:** Vitest, Playwright, Vercel, Inngest Cloud.

**How to build**
1. Unit tests: price engine, URL validator, reference generator, band rules.
2. Playwright smoke tests: sign in, run investigation on the seeded URL, open verdict, submit report, moderator publishes a finding.
3. Production: set all env vars in Vercel, deploy, then sync the Inngest app URL; add the Clerk and Stream webhook URLs for the production domain.
4. Run `prisma migrate deploy` against the production database and seed demo data.
5. Prepare two demo accounts (traveller, moderator) and a seeded fake URL that always yields "Suspicious".
6. Record a backup screen capture in case live APIs fail on stage.
7. Demo flow (3 minutes): ask in Assamese → price range → paste suspicious link → watch live run → verdict with evidence → read aloud → report by voice → moderator publishes finding.

**Done when:** the full demo runs twice in a row on the production URL.

---

## Appendix A — Environment variables

```
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
FIRECRAWL_API_KEY=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
PINECONE_API_KEY=
PINECONE_INDEX=ttd-prod        # integrated index, llama-text-embed-v2
NEXT_PUBLIC_STREAM_KEY=
STREAM_SECRET=
SARVAM_API_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
R2_ACCOUNT_ID=
S3_ACCESS_KEY_ID=
S3_ACCESS_KEY_SECRET=
NEXT_PUBLIC_MAPBOX_TOKEN=
GEMINI_MODEL=                 # optional, default gemini-3.5-flash-lite
UPSTASH_REDIS_REST_URL=       # optional
UPSTASH_REDIS_REST_TOKEN=     # optional
```

## Appendix B — Suggested folder layout

```
src/
  app/(app)/{dashboard,investigate,price,assistant,voice,map,reports,directory,evidence,settings,help,moderation,workflows,knowledge}
  app/(auth)/{sign-in,sign-up}
  app/api/{inngest,chat,voice,stream,webhooks,investigations,map,price}
  components/{ui,shell,investigation,reports,voice,map}
  inngest/{client.ts,functions/*}
  server/{agent.ts,research.ts,capture.ts,knowledge.ts,price.ts,voice.ts,safety.ts}
  lib/{db.ts,env.ts,nav.ts,utils.ts}
prisma/{schema.prisma,seed.ts}
```

## Appendix C — If you are short on time

Keep Phases 0–10, 13–15, 17–21, 22 (without Stream), 25 (read-aloud only), 29 (URL safety only), 30. Fake or skip: Stream discussion (use plain comments), voice reporting (show the recorder UI only), billing, workflows admin. The demo story still holds: question → price → investigation → verdict with evidence → read aloud.

## Appendix D — Verify before you build

Service APIs and model names change. Before each integration phase, open the vendor docs and confirm: Sarvam model and language codes, Browserbase connect flow, Firecrawl SDK method names, Pinecone `createIndexForModel`, `upsertRecords` and `searchRecords` signatures, Stagehand v3 constructor options and Browserbase `sessions.debug` live view fields, the current Gemini model id, Stream channel types, Clerk webhook helper, and the AI SDK version-specific helpers (`generateObject`, `streamText`, `useChat`, tool definition shape).
