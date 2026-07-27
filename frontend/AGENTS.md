# Vite React Frontend Template

This directory is the `project/frontend` Vite React TypeScript application.

## Stack

- Use Vite + React 19 + TypeScript + Tailwind CSS v4.
- Use React function components and hooks.
- Use `react-router-dom` for in-app navigation when routing is needed.
- Use `lucide-react` for icons and verify icon names before importing.
- Use `pnpm`; do not switch to `npm`, `yarn`, or `bun`.
- Add dependencies in `package.json`; prefer existing template dependencies.

## Entry Points And Structure

- `index.html` and `src/main.tsx` are the app entries.
- `src/main.tsx` calls `installErrorLogging()` and wraps `<App />` in `<ErrorBoundary>` so uncaught errors, unhandled promise rejections, and render crashes are logged to the browser console (prefixed `[app]`) instead of white-screening silently. On a render crash the `ErrorBoundary` also shows the full error (message + stack + component stack) with a "copy error" button that prompts the user to paste it into the chat for a fix. Keep both in place; do not remove them. You may restyle the fallback, but keep the `console.error` calls and the copyable error report.
- `src/App.tsx` owns top-level routing or app composition.
- Use `src/components` for reusable UI, `src/pages` for route pages, `src/hooks` for reusable state logic, `src/types` for shared types, and `src/utils` for pure helpers.
- The starter content in `src/App.tsx` is only a readiness placeholder; replace it with the requested app flow during generation or modification.
- For larger apps, add feature folders deliberately instead of putting all logic into `App.tsx`.
- Supabase is intentionally not part of this lightweight starter. Add `@supabase/supabase-js` and one shared `src/lib/supabase.ts` only when the requirement needs Supabase; components and pages must reuse that single client.

## Commands

- `pnpm dev`: run the local Vite development server.
- `pnpm run lint`: run static error checks.
- `pnpm run lint:file -- src/App.tsx`: quickly check one changed TypeScript/React file.
- `pnpm run typecheck`: check the app and Vite config TypeScript projects.
- `pnpm run build`: run non-mutating production validation.

## Template File Map

The freshly copied template already contains the following. Use this map to plan the whole app up front; open a file with `Read` only when you are about to modify it — do not re-explore the template to rediscover its contents.

```text
project/frontend/
├── index.html                     # HTML entry, mounts #root
├── package.json                   # deps + scripts (pnpm@9); prefer existing deps
├── vite.config.ts                 # Vite config
├── eslint.config.js               # lint rules
├── tsconfig*.json                 # TS config (app/node/base)
└── src/
    ├── main.tsx                   # entry — calls installErrorLogging() + wraps <App/> in <ErrorBoundary>; keep both
    ├── App.tsx                    # PLACEHOLDER starter — replace with your routing/app composition
    ├── index.css                  # Tailwind v4 CSS-first entry + shared CSS tokens
    ├── vite-env.d.ts              # Vite env typings
    ├── components/
    │   └── ErrorBoundary.tsx      # render-crash catcher with copyable report; keep
    └── lib/
        └── error-logging.ts       # installErrorLogging(); keep, do not remove
```

Directories NOT present yet — create them as the app needs: `src/pages` (route pages), `src/types` (shared types), `src/utils` (pure helpers), `src/hooks` (reusable state logic), and more under `src/components`. This is the lightweight template with no component library, so hand-build components with Tailwind. Tailwind v4 is configured through `@tailwindcss/vite` and CSS; do not recreate `tailwind.config.js` or `postcss.config.js` unless a dependency explicitly requires them.
