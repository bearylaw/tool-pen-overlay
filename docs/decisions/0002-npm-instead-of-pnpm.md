# Use npm instead of pnpm

- Status: accepted
- Date: 2026-10-23

## Context

The standards default to pnpm. The developer machine has Node and npm but
not pnpm, and agents do not install global tools. npm now supports the two
supply-chain controls the standards ask for.

## Considered options

1. pnpm, installed by the user or through Corepack.
2. npm with `ignore-scripts=true` and `min-release-age=7` in `.npmrc`.

## Decision

npm. `.npmrc` blocks lifecycle scripts and resolves nothing younger than
seven days; the one script needed (Electron's binary download) runs
explicitly as `npm run electron:fetch`. `npm ci` installs from the committed
lockfile.

## Consequences

Contributors need nothing beyond Node. Electron is downloaded in a separate
step, which the README and AGENTS.md name. Revisit if npm's controls fall
behind pnpm's or pnpm becomes available everywhere this is built.
