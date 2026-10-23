# Stay on TypeScript 6 until tools support TypeScript 7

- Status: accepted
- Date: 2026-10-23

## Context

TypeScript 7 (the native compiler) is current, but it does not yet publish
the JavaScript compiler API. dependency-cruiser uses that API to parse
TypeScript; with 7 it silently found no modules, so the architecture rules
checked nothing.

## Considered options

1. TypeScript 7 plus another parser for dependency-cruiser (`@swc/core`).
2. TypeScript 6.0, the last release with the JavaScript API.

## Decision

TypeScript 6.0. It keeps the architecture lint real without another native
dependency, and the language features used here are the same.

## Consequences

Type checking is slower than with 7, which does not matter at this size.
Move to 7 when dependency-cruiser supports it; `npx depcruise src --config
.dependency-cruiser.cjs` must report a non-zero module count afterwards.
