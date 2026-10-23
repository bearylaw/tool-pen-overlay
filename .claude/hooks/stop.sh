#!/usr/bin/env bash
# Stop hook: the turn does not end with a red check, uncommitted work or
# unpushed commits (guidelines/git.md in core-standards-docs).
#
# Usage from .claude/settings.json: bash .claude/hooks/stop.sh "<check command>"
# Exit 2 sends the agent back with the message on stderr. It does so once per
# stop: when Claude Code reports stop_hook_active, the agent has already been
# sent back and may stop, having said why it did not commit or push.

check_cmd="${1:-}"
input="$(cat)"

case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

if [ -n "$(git status --porcelain)" ]; then
  if [ -n "$check_cmd" ]; then
    if ! output="$(sh -c "$check_cmd" 2>&1)"; then
      {
        echo "\`$check_cmd\` fails. Fix it before finishing, or say why it is left red."
        printf '%s\n' "$output" | tail -n 40
      } >&2
      exit 2
    fi
  fi
  {
    echo "Uncommitted changes. Commit each finished logical step and push (guidelines/git.md)."
    echo "If the step is unfinished or the changes were there before this session, say so and stop."
    git status --short | head -n 20
  } >&2
  exit 2
fi

[ -n "$(git remote)" ] || exit 0
git rev-parse --verify --quiet HEAD >/dev/null || exit 0

if ! upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  echo "Branch $(git branch --show-current) has no upstream. Push it: git push -u origin HEAD (guidelines/git.md)." >&2
  exit 2
fi

ahead="$(git rev-list --count '@{u}..HEAD')"
if [ "$ahead" -gt 0 ]; then
  echo "$ahead commit(s) not pushed to $upstream. Push before finishing (guidelines/git.md)." >&2
  exit 2
fi

exit 0
