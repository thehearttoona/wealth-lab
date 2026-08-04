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

`src/services/` map: `storage.ts` (expenses + recurring bills), `incomeStorage`, `installmentStorage`, `monthlySummaryStorage`, `investmentStorage` (+ `getPortfolioSummary`), `portfolioGoalStorage`, `investmentPlanStorage`, `purchaseGoalStorage`, plus non-storage services below.

### Tax — `src/utils/taxCalc.ts` + `src/types/tax.ts`
Thai personal income tax (ภ.ง.ด.90/91) estimator. Brackets, the 50%-capped-at-100k salary expense, the 60k personal allowance, and the per-asset capital-gains rules are all **data**, not `if`s, so they can be edited per year.

**Salary/bonus/withholding/social-security live in `TaxProfile.months` — 12 rows, stored as a `jsonb` column.** Two things to know:
- **This is deliberately NOT read from `incomes`.** The tax screen owns its own numbers so there's never a second source of truth for the same fact. The "เติมจากรายรับ" button is an explicit one-time prefill into the monthly table, not a live link.
- **Monthly entry does not make the tax more accurate** — Thai PIT is assessed on the annual total, so `40k×6 + 45k×6` and `42.5k×12` produce identical tax. Monthly exists for per-month withholding (which varies), mid-year raises, and separating "actual so far" from "projected full year".

**Never show a partial-year total as the annual estimate.** Brackets are non-linear, so 8 months of data run straight through them understates the year badly (50k/mo → ฿4,200 vs ฿20,600 actual, ~5× low). `calculateTax` returns `filledMonths` and `projectFullYear()` returns a separate projection — the screen shows them as two distinct cards. A previous version silently overwrote `salaryMonths` with "months that have data" and produced exactly this bug.

Known gaps (annual `extraDeductions` is one lumped field): no per-item deduction caps (RMF 500k, SSF 200k, retirement-group 500k, spouse/children/parents, insurance), no donation 10%/2× base, no dividends or dividend tax credit, and the constants aren't keyed by tax year. Needs `sql/tax_profiles.sql`.

### Sell review — "ทบทวนการขาย" (`src/utils/sellReview.ts`)
Answers "would I have done better holding?" by comparing each `realized_trades` row's `sellPrice` against today's price. Its purpose is to pick a **sell rule empirically** instead of guessing: mostly-sold-too-early → trailing stop / scale out; mostly-well-timed → don't bolt on an automatic rule. Requires no new user input.

Guards that must not be removed — each exists because its absence produces a confidently wrong number:
- Sales newer than `MIN_DAYS_TO_JUDGE` (30) are `too_recent` and excluded from both the counts **and** the money totals.
- A ±`FLAT_BAND_PERCENT` (3%) band counts as `flat` — smaller moves are daily noise, not timing skill.
- Fewer than `MIN_TRADES_FOR_DIAGNOSIS` (3) judged trades → `not_enough_data`; never diagnose a habit from one or two trades.
- Thai funds have no price API (manual NAV), so those rows are `unknown`. The screen always prints how many trades fell out of the conclusion.
- Prices are fetched once per `priceKeyOf` (type+symbol+currency), not per trade — Twelve Data's free tier is 800 req/day.

The screen states the hindsight caveats on-page: today's price is one point in time, the proceeds were reinvested (so this is opportunity cost, not proof of a mistake), and tax/fees are not deducted.

### Purchase goals — "ของที่อยากได้"
A wishlist gated on trading performance: an item priced X can only be bought once **realized** profit reaches `multiplier × X` (default 10). Rules, all encoded in `src/utils/purchaseGoals.ts#planPurchaseGoals`:
- **Realized only** (`summarizeRealized(trades).totalPnlTHB`). Unrealized profit never unlocks anything — the money has to actually be out.
- **It's a queue, not a shared pool.** Items are ordered by `sortOrder`; the top item consumes its full quota before any profit flows to the next. Three items do *not* all unlock off one profit pot.
- **Marking an item bought consumes `price × multiplier` permanently**, not just the price — the quota is spent, so the rest of the queue drops back and rebuilds.
Needs `sql/purchase_goals.sql`. Entry points: gift-icon button in Portfolio's action row, plus a summary card in Portfolio's header grid (shown only when the queue is non-empty).

### Navigation — responsive fork
`src/navigation/index.tsx` gates on `useAuth()` (shows `LoginScreen` when logged out), then picks a layout from `useResponsive().isDesktop`. Both branches share **one** `Stack.Navigator`; only the root screen and the chrome around it differ:
- Desktop (≥1024px): `DesktopSidebar` is a persistent shell rendered **outside `NavigationContainer`**, so pushing a sub-screen (Accounts, ManageCatalog, …) keeps the sidebar on screen. The active tab is local state in `Navigation`, passed down to the Stack's root screen (`DesktopRootScreen`) through `DesktopTabContext` — don't move that state back inside the navigator. Tapping a sidebar item also `navigate`s back to the root route via `navigationRef`, otherwise the press looks dead while a pushed screen covers the pane.
- Mobile: root screen is `MobileTabNavigator` (`@react-navigation` bottom tabs).

`useResponsive()` (`src/utils/responsive.ts`) is the single source for breakpoints, `isDesktop/isTablet/isMobile/isWide`, and `sidebarWidth`. Screens frequently branch on it — e.g. Portfolio uses a `FlatList` grid on desktop but a `ScrollView` on mobile (a plain flex `FlatList` breaks scrolling on web).

**There is no desktop max-width anywhere.** `maxWidth` (1200) and `contentMaxWidth` (800) used to come from `useResponsive()` and were **removed from the hook and from all 15 screens** — desktop content fills the whole pane. When a wide monitor makes a page look sparse, the fix is **more columns, never a width cap**:
- `PortfolioScreen` computes `gridCols` from the measured pane width against `GRID_COL_TARGET` (380px/card) and remounts the `FlatList` via `key={`desktop-${gridCols}col`}` — `numColumns` can't change in place.
- Summary/queue cards use a wrap grid (`flexDirection: 'row'` + `flexWrap` + `flexBasis: N` + `flexGrow: 1` + `minWidth: 0`). See `styles.cardGrid`/`cardGridItem` in `PortfolioScreen` and `PurchaseGoalsScreen`.
- The only things still width-capped are **overlays**: `Modal` cards (400–500) and the login card. Those are not page content.
- **When locking a card's width to a number, override `flexBasis` too.** `flex: 1` compiles to `flex: 1 1 0%` on react-native-web, and `flex-basis: 0%` beats `width` — set `width` alone and the card collapses to zero.

Two responsive traps that already bit once:
- **Don't gate "stack it vertically" on `isMobile`** — the 768–1023 tablet band is neither `isMobile` nor `isDesktop`, so those rows stay side-by-side and get crushed. Branch on `!isDesktop`.
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
