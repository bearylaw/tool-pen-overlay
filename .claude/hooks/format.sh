#!/usr/bin/env bash
# PostToolUse hook: format the file Claude just edited with Biome.
input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')"
case "$file" in
  *.ts | *.mjs | *.cjs | *.js | *.json | *.css) npx biome format --write "$file" >/dev/null 2>&1 || true ;;
esac
exit 0
