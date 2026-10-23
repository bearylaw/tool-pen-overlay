# Build the overlay with Electron and TypeScript

- Status: accepted
- Date: 2026-10-23

## Context

The app must run on Windows, macOS and Linux, draw over every monitor with
no perceptible delay, pass clicks through when not drawing, and have a
polished, accessible toolbar. The developer machine has Node but no Rust
toolchain.

## Considered options

1. Electron: Chromium on every platform, `setIgnoreMouseEvents`, per-window
   always-on-top levels, low-latency (`desynchronized`) canvases,
   `pointerrawupdate`, predicted pointer events.
2. Tauri: smaller bundles, but needs Rust, and its click-through has no
   per-region forwarding; the system web view differs per platform (WebKit
   on macOS and Linux has no `pointerrawupdate` or predicted events).
3. Native per platform (WPF, AppKit, GTK): best footprint, three codebases.

## Decision

Electron with TypeScript. The same Chromium input pipeline on every platform
is what makes the latency work identical everywhere, and the window APIs
cover overlay, toolbar and panel needs directly.

Architecture: one frameless, transparent, non-focusable overlay window per
display (never activates, so it never covers the toolbar or steals focus);
one toolbar window and one panel window, both focusable and above the
overlays. The main process owns settings and runtime state; pages send typed
commands and intents that are parsed with zod on receipt.

## Consequences

Installers are around 100 MB and memory use is that of a Chromium app. The
security checklist for Electron applies (sandbox, context isolation, CSP,
custom protocol, fuses), and Electron must be kept current.
