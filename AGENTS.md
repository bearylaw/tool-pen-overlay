# {{name}}

{{summary}}

Engineering standards: [core-standards-docs](https://github.com/bearylaw/core-standards-docs),
checked out at `{{standards-path}}`. **Read its `guidelines/rules.md` before
the first edit**; look up the rest by task through its `guidelines/README.md`.
Organisation docs (brand, projects, hosting, jurisdiction): {{org-docs}}.
This file is only what is true of this project.

## Commands

| | |
|---|---|
| install | `{{install}}`, then `lefthook install` once |
| dev | `{{dev}}` |
| check | `{{check}}`: typecheck, lint, format, tests. Green means done |
| test | `{{test}}`; show only failures |
| build | `{{build}}` |

## Git

IMPORTANT: commit each finished logical step with `check` green, and push the
branch before reporting done. Unasked, every session. Force-push, tags,
releases and deploys only when asked. Detail: the standards' `guidelines/git.md`.

## Conventions that differ from defaults

- <only rules an agent would get wrong otherwise; delete this line if none>

## Never

- Never force-push, tag, publish or deploy unless asked in this session.
- Never edit `.env`, lockfiles by hand, or generated files.
- <what must not happen in this repository>

## Context

- Use the Explore subagent for codebase-wide searches; return a summary.
- Prefer `git diff --stat` and `git log --oneline -20`.
- Do not re-read a file already read this session unless it changed.
