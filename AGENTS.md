# Pen Overlay

A cross-platform (Windows, macOS, Linux) screen-annotation overlay: one
transparent always-on-top window per display to draw on, a draggable toolbar
window, and one panel window beside it. Electron + TypeScript. Public repo.

Engineering standards: [core-standards-docs](https://github.com/bearylaw/core-standards-docs),
checked out at `D:\git\core\standards-docs`. **Read its `guidelines/rules.md` before
the first edit**; look up the rest by task through its `guidelines/README.md`.
Playbook: `playbooks/desktop-tool.md`. This file is only what is true of this project.

## Commands

| | |
|---|---|
| install | `npm ci`, then `npm run electron:fetch` (scripts are blocked), then `lefthook install` once |
| dev | `npm run dev` (set `PEN_OVERLAY_USER_DATA` for throwaway settings) |
| check | `npm run check`: typecheck, Biome, dependency-cruiser, Vitest. Green means done |
| test | `npx vitest run`; `npm run test:e2e` drives the real app (needs a desktop; ask first, it takes over the screen) |
| build | `npm run build` (bundles to `dist/`); `npm run dist` makes installers in `release/` |

## Git

IMPORTANT: commit each finished logical step with `check` green, and push the
branch before reporting done. Unasked, every session. Force-push, tags,
releases and deploys only when asked. Detail: the standards' `guidelines/git.md`.

## Conventions that differ from defaults

- npm, not pnpm; TypeScript 6, not 7 ([decisions](docs/decisions/)).
- Processes stay apart: `shared → main | preload | renderer`, and the
  renderer pages `overlay`, `toolbar`, `panel` never import each other
  (`renderer/ui` is their shared module). dependency-cruiser enforces it.
- Settings change only through `reduce` in `src/shared/commands.ts`; side
  effects go through `Intent`s in `src/main/controller.ts`. Every IPC
  message is parsed with zod in `src/main/main.ts`.
- UI text goes through `src/shared/i18n.ts` (en, de). No `innerHTML`: build
  DOM with `h()` from `renderer/ui/dom.ts`.
- New settings fields need a `.catch(default)` in the schema so old files
  still load; bump `SETTINGS_VERSION` only for a layout change, with a step
  in `migrateSettings`.
- `version` lives only in `package.json`; the release workflow checks the tag
  matches. Add the release notes to `CHANGELOG.md` before tagging.

## Never

- Never force-push, tag, publish or deploy unless asked in this session.
- Never edit `package-lock.json` by hand or `dist/`, `release/`.
- Never run the app or `test:e2e` while the user is working without asking:
  the overlay captures the real mouse in drawing mode.
- Never add network access, telemetry or screen capture.

## Context

- Use the Explore subagent for codebase-wide searches; return a summary.
- Prefer `git diff --stat` and `git log --oneline -20`.
- Do not re-read a file already read this session unless it changed.
