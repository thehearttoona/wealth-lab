# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Narix" (aka Wealth Lab) — a personal finance + investment/trading tracker. Expo / React Native app that is **primarily deployed as a web app to Vercel** (`narix.vercel.app`), though the same codebase targets iOS/Android. UI is in **Thai**. Backend is **Supabase** (auth + Postgres). A separate Python FastAPI service (`mt5_backend/`) handles MetaTrader 5 grid trading.

## Commands

```bash
npm run web              # expo start --web (dev; also `npm run react` for port 8081)
npm run start            # expo start (choose platform)
npm run ios / android    # native dev
npx tsc --noEmit         # typecheck — the only "test". Run before every commit.
npx expo export --platform web   # production web build → dist/ (this is the Vercel buildCommand)
```

There is **no unit-test framework and no linter** configured. `npx tsc --noEmit` is the correctness gate.

**Known pre-existing type errors** live in `GridTradingScreen.tsx`, `TradingCalculatorScreen.tsx`, `mt5Api.ts`, and `supabase/functions/telegram-bot/index.ts` (Deno globals). These are unrelated to app code — when typechecking, filter to the files you touched (e.g. `npx tsc --noEmit 2>&1 | grep <yourfile>`) rather than expecting a clean run.

### Deploy
```bash
git push origin main                                    # push first
vercel --prod --scope thehearttoonas-projects --yes     # deploy (may exceed a 2-min tool timeout; re-run if so)
```
Deploys go to Vercel account scope `thehearttoonas-projects`. `vercel.json` sets `buildCommand`, `outputDirectory: dist`, and an SPA rewrite that routes everything **except `/api/*`** to `/`.

### Python trading backend (separate, optional)
```bash
npm run backend          # cd mt5_backend && python main.py  (FastAPI on :8000)
npm run dev              # runs web + backend concurrently
```

## Architecture

### Storage layer — the core pattern
Every data domain has a `src/services/*Storage.ts` module wrapping Supabase. They all follow the same conventions, so match them when adding one:
- `getUserId()` reads the authenticated user; rows are per-user and enforced by **RLS** — always attach `user_id` on writes.
- **DB uses snake_case, TS uses camelCase.** Each module defines `mapXFromDb` / `mapXToDb` translators. When you add a field to a type, you must add it to **both** mappers or it silently drops on save/load.
- Some settings are per-user singletons (e.g. `investment_plan`, MT5 settings) using `.maybeSingle()` + `upsert`.
- Schema changes are applied by hand via SQL in the Supabase console (no migrations checked in). When adding a column, provide the idempotent `alter table ... add column if not exists ...` for the user to run.

`src/services/` map: `storage.ts` (expenses + recurring bills), `incomeStorage`, `installmentStorage`, `monthlySummaryStorage`, `investmentStorage` (+ `getPortfolioSummary`), `portfolioGoalStorage`, `investmentPlanStorage`, `tradingStorage`, `mt5Storage`, plus non-storage services below.

### Navigation — responsive fork
`src/navigation/index.tsx` gates on `useAuth()` (shows `LoginScreen` when logged out), then renders **one of two entirely different layouts** based on `useResponsive().isDesktop`:
- Desktop (≥1024px): custom `DesktopSidebar` + swapped content pane (no real navigator — active tab is local state).
- Mobile: `@react-navigation` bottom tabs.

`useResponsive()` (`src/utils/responsive.ts`) is the single source for breakpoints, `isDesktop/isMobile`, grid columns, sidebar width. Screens frequently branch on it — e.g. Portfolio uses a `FlatList` 2-col grid on desktop but a `ScrollView` on mobile (a plain flex `FlatList` breaks scrolling on web).

### Price data — `src/services/priceApi.ts` + Vercel proxies
Live prices come from multiple free sources: **Binance** (crypto, real-time), **CoinGecko** (crypto fallback), **Twelve Data** (stocks, key embedded client-side), **open.er-api.com** (FX rates, 1-hr cached), and **Yahoo Finance via `api/yahoo-quote.js`** (stock fallback, gold `GC=F`, daily candles).

**CORS is the recurring trap here.** Yahoo Finance, Frankfurter, and metals.live send *no* `Access-Control-Allow-Origin`, so they work from `curl`/Node but throw a silent `"Failed to fetch"` in a real browser. Rules:
- Browser-blocked APIs must be routed through a Vercel serverless function in `api/*.js` (server-to-server has no CORS), which adds `Access-Control-Allow-Origin: *`. See `api/yahoo-quote.js` as the template.
- **Always verify price/network changes in a headless browser (Playwright), never just curl** — curl cannot reproduce CORS failures.

Fund NAV (Thai funds) has **no working live API** — SEC Open Data's NAV endpoint is impractical (oldest-first, 100/page, no latest filter). Instead a static catalog `public/funds.json` (~3000 funds) is lazily fetched and searched client-side (`src/services/fundCatalog.ts`); NAV is entered manually.

Note there are **two** currency-conversion paths: `utils/constants.ts#convertToTHB` uses **hardcoded** rates (used by `getPortfolioSummary`), while `priceApi.ts` uses **live** rates. Keep that in mind when reconciling portfolio totals.

### AI assistant
`src/services/aiService.ts` builds a financial context (expenses/income/portfolio/trading aggregated) and the `AIAssistant` component chats over it. The backend URL comes from MT5 settings (defaults to a LAN IP).

### Fonts & theming
`App.tsx` loads Noto Sans Thai + Nunito via `useFonts` and **renders `null` until fonts are ready** (splash held). Thai text must use `NotoSansThai_*` families in styles — mixing families is a visible bug the user cares about. Icons are **`@expo/vector-icons` (Ionicons)** only. Do **not** reintroduce `react-native-iconify` — its Babel plugin double-minifies the web bundle and produces a blank white screen on Vercel. All colors come from `COLORS` in `src/utils/constants.ts`.

### Other pieces
- `mt5_backend/` — standalone FastAPI + `MetaTrader5` package; opens 7-position martingale grids, auto-closes the rest when any one closes, streams over WebSocket. Runs on a Windows VPS with MT5 installed; app talks to it over a configurable URL. See `mt5_backend/README.md`.
- `supabase/functions/telegram-bot/` — a Deno edge function (its TS errors are expected under the app's tsconfig).

## Conventions

- Thai-language UI and code comments throughout; keep new user-facing strings and comments in Thai to match.
- Thai Buddhist-era dates (year > 2400) are normalized via `toChristianYear()` in `constants.ts`.
- Supabase URL + publishable key are hardcoded in `src/services/supabase.ts` (public anon key, RLS-protected — expected). The MT5 backend's real secrets stay in its own `.env`, never in the client.
