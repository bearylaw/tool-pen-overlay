# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

[Open an issue](https://github.com/bearylaw/tool-pen-overlay/issues/new/choose)
with your system, the Pen Overlay version (bottom of the settings panel),
what you did and what happened. The log (`logs/main.log` in the settings
folder, see the README) helps.

## Changing code

1. Fork, then `npm ci` and `npm run electron:fetch`.
2. `npm run dev` runs the app with your changes. Set `PEN_OVERLAY_USER_DATA`
   to a folder to keep your real settings untouched.
3. Keep changes small and focused. New behaviour comes with a test; a bug
   fix with a test that failed before.
4. `npm run check` must pass. It is what CI runs.
5. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:` …); the body says why.
6. User-visible changes get a line under `## [Unreleased]` in
   [CHANGELOG.md](CHANGELOG.md).

How the code is organised and the rules it follows are in
[AGENTS.md](AGENTS.md) and [docs/decisions/](docs/decisions/).

### Adding a language

Add a dictionary to `src/shared/i18n.ts` (the type makes sure every key is
translated), add the code to `LANGUAGES` in `src/shared/settings.ts`, and a
`language.<code>` label in every dictionary.

## Conduct

Be kind and assume good intent. Harassment of any kind is not tolerated.
