# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Narix" (aka Wealth Lab) — a personal finance + investment tracker. Expo / React Native app that is **primarily deployed as a web app to Vercel** (`narix.vercel.app`), though the same codebase targets iOS/Android. UI is in **Thai**. Backend is **Supabase** (auth + Postgres).

The MT5 grid-trading feature and the in-app AI assistant were **removed** — no MT5 screens, no `mt5_backend/` Python service, no `aiService`/`AIAssistant`. Don't reintroduce them.

## Commands

```bash
npm run web              # expo start --web (dev; also `npm run react` for port 8081)
npm run start            # expo start (choose platform)
npm run ios / android    # native dev
npx tsc --noEmit         # typecheck — the only "test". Run before every commit.
npx expo export --platform web   # production web build → dist/ (this is the Vercel buildCommand)
```

There is **no unit-test framework and no linter** configured. `npx tsc --noEmit` is the correctness gate.

**App code typechecks clean.** The only remaining errors are the 8 in `supabase/functions/telegram-bot/index.ts` (Deno globals, expected under the app's tsconfig). Anything else is yours.

### Deploy
```bash
git push origin main                                    # push first
vercel --prod --scope thehearttoonas-projects --yes     # deploy (may exceed a 2-min tool timeout; re-run if so)
```
Deploys go to Vercel account scope `thehearttoonas-projects`. `vercel.json` sets `buildCommand`, `outputDirectory: dist`, and an SPA rewrite that routes everything **except `/api/*`** to `/`.

## Architecture

### Storage layer — the core pattern
Every data domain has a `src/services/*Storage.ts` module wrapping Supabase. They all follow the same conventions, so match them when adding one:
- `getUserId()` lives in `services/supabase.ts` — import it, don't re-declare it. Rows are per-user and enforced by **RLS**, so always attach `user_id` on writes.
- **DB uses snake_case, TS uses camelCase.** Each module defines `mapXFromDb` / `mapXToDb` translators. When you add a field to a type, you must add it to **both** mappers or it silently drops on save/load.
- Some settings are per-user singletons (e.g. `investment_plan`) using `.maybeSingle()` + `upsert`.
- Schema changes are applied by hand via SQL in the Supabase console (no migrations checked in). When adding a column, provide the idempotent `alter table ... add column if not exists ...` for the user to run.

`src/services/` map: `storage.ts` (expenses + recurring bills), `incomeStorage`, `installmentStorage`, `monthlySummaryStorage`, `investmentStorage` (+ `getPortfolioSummary`), `portfolioGoalStorage`, `investmentPlanStorage`, plus non-storage services below.

### Navigation — responsive fork
`src/navigation/index.tsx` gates on `useAuth()` (shows `LoginScreen` when logged out), then picks a layout from `useResponsive().isDesktop`. Both branches share **one** `Stack.Navigator`; only the root screen and the chrome around it differ:
- Desktop (≥1024px): `DesktopSidebar` is a persistent shell rendered **outside `NavigationContainer`**, so pushing a sub-screen (Accounts, ManageCatalog, …) keeps the sidebar on screen. The active tab is local state in `Navigation`, passed down to the Stack's root screen (`DesktopRootScreen`) through `DesktopTabContext` — don't move that state back inside the navigator. Tapping a sidebar item also `navigate`s back to the root route via `navigationRef`, otherwise the press looks dead while a pushed screen covers the pane.
- Mobile: root screen is `MobileTabNavigator` (`@react-navigation` bottom tabs).

`useResponsive()` (`src/utils/responsive.ts`) is the single source for breakpoints, `isDesktop/isTablet/isMobile/isWide`, `maxWidth` (1200, multi-column pages), `contentMaxWidth` (800, single-column lists/forms), and `sidebarWidth`. Screens frequently branch on it — e.g. Portfolio uses a `FlatList` 2-col grid on desktop but a `ScrollView` on mobile (a plain flex `FlatList` breaks scrolling on web).

Two responsive traps that already bit once:
- **Don't gate "stack it vertically" on `isMobile`** — the 768–1023 tablet band is neither `isMobile` nor `isDesktop`, so those rows stay side-by-side and get crushed. Branch on `!isDesktop`.
- **`alignSelf: 'center'` + `width: '100%'` does nothing without a `maxWidth`.** Any desktop wrapper needs all three, or the page just stretches across a 2560px monitor.
- **A `TextInput` in a flex row needs `minWidth: 0` on top of `flex: n`.** On web it renders as `<input>`, whose intrinsic width (~20 chars) becomes its automatic minimum size, so `flexShrink` can't shrink it. Measured: two inputs at `flex: 3` / `flex: 2` in a 279px card each stayed 192px wide — 141px of overflow — and dropped to 141/102 with `minWidth: 0`. Native doesn't show this, so it only appears on the deployed web app.

Every `Modal` card must be a `ScrollView` with `maxHeight: '100%'` + `flexGrow: 0` (padding goes on `contentContainerStyle`). `public/index.html` sets `body { overflow: hidden }`, so a modal taller than the viewport doesn't just look bad — its save button becomes unreachable.

### Price data — `src/services/priceApi.ts` + Vercel proxies
Live prices come from multiple free sources: **Binance** (crypto, real-time), **CoinGecko** (crypto fallback), **Twelve Data** (stocks, key embedded client-side), **open.er-api.com** (FX rates, 1-hr cached), and **Yahoo Finance via `api/yahoo-quote.js`** (stock fallback, gold `GC=F`, daily candles).

**CORS is the recurring trap here.** Yahoo Finance, Frankfurter, and metals.live send *no* `Access-Control-Allow-Origin`, so they work from `curl`/Node but throw a silent `"Failed to fetch"` in a real browser. Rules:
- Browser-blocked APIs must be routed through a Vercel serverless function in `api/*.js` (server-to-server has no CORS), which adds `Access-Control-Allow-Origin: *`. See `api/yahoo-quote.js` as the template.
- **Always verify price/network changes in a headless browser (Playwright), never just curl** — curl cannot reproduce CORS failures.

Fund NAV (Thai funds) has **no working live API** — SEC Open Data's NAV endpoint is impractical (oldest-first, 100/page, no latest filter). Instead a static catalog `public/funds.json` (~3000 funds) is lazily fetched and searched client-side (`src/services/fundCatalog.ts`); NAV is entered manually.

The **Twelve Data key must stay server-side** — it goes through `api/twelve-data.js`, which reads `TWELVE_DATA_API_KEY` from the Vercel env (with the old public key as a temporary fallback). Never put a key back into `priceApi.ts`; it ships in the browser bundle.

Note there are **two** currency-conversion paths: `utils/constants.ts#convertToTHB` uses **user-set** rates (used by `getPortfolioSummary`), while `priceApi.ts` uses **live** rates. Keep that in mind when reconciling portfolio totals.

`convertToTHB` reads a module-level cache, not React state — so nothing re-renders when the rates land. `Navigation` therefore **blocks on `refreshCurrencyCache()` before rendering any screen**; don't turn that back into a fire-and-forget `useEffect` or totals will paint with the hardcoded fallback rates and stay wrong until the screen remounts.

### Fonts & theming
`App.tsx` loads **only Noto Sans Thai** via `useFonts` and **renders `null` until fonts are ready** (splash held). Every `Text`/`TextInput` style must set an explicit `NotoSansThai_*` family — no family means the system font leaks in, and mixing families is a visible bug the user cares about.

**Never set `fontWeight` alongside `fontFamily`** — on web that fake-bolds the glyphs on top of an already-weighted font file. Pick the weight by choosing the file: `_300Light` / `_400Regular` / `_500Medium` / `_600SemiBold` (SemiBold is the heaviest one loaded).

Use the `FONTS` / `TEXT` presets in `utils/constants.ts` rather than re-typing family strings — `screenTitle: { ...TEXT.screenTitle, color: COLORS.text }`. `ProfileScreen.tsx` is the reference; the older screens still hardcode their own values and can be migrated opportunistically.

### Dialogs
`react-native-web` doesn't implement `Alert.alert` with buttons, so every prompt needs a `Platform.OS === 'web'` fork. That fork lives in **`utils/dialog.ts`** — use `notify(msg, title?)` and `await confirmAsk(title, msg, yesLabel?)`. Don't hand-roll `window.alert` / `Alert.alert` in a screen again. Icons are **`@expo/vector-icons` (Ionicons)** only. Do **not** reintroduce `react-native-iconify` — its Babel plugin double-minifies the web bundle and produces a blank white screen on Vercel. All colors come from `COLORS` in `src/utils/constants.ts`.

### Other pieces
- `supabase/functions/telegram-bot/` — a Deno edge function (its TS errors are expected under the app's tsconfig).

## Conventions

- Thai-language UI and code comments throughout; keep new user-facing strings and comments in Thai to match.
- Thai Buddhist-era dates (year > 2400) are normalized via `toChristianYear()` in `constants.ts`.
- Supabase URL + publishable key are hardcoded in `src/services/supabase.ts` (public anon key, RLS-protected — expected). The MT5 backend's real secrets stay in its own `.env`, never in the client.
