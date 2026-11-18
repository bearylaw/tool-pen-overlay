# Capture the screen for an optional freeze while drawing

- Status: accepted
- Date: 2026-11-18

## Context

Until now the app never captured the screen: the overlay is transparent and
everything behind the ink keeps changing (videos play on, windows update).
Users asked for an option to freeze the screen while drawing, so annotations
stay on the picture they were made for. That takes a still image of every
display, which is screen capture, and on macOS needs the Screen Recording
permission.

## Considered options

1. Keep the no-capture rule and do without a freeze.
2. Capture each display once when drawing starts, behind a setting that is
   off by default, and show the image under the ink until drawing stops.

## Decision

Option 2, with these limits:

- Off by default (*Settings → Drawing → Freeze the screen while drawing*).
- One capture per start of drawing mode, through Electron's
  `desktopCapturer` in the main process. The app's own windows are hidden
  for about 150 ms first, so existing ink and the toolbar are not part of
  the picture.
- Images stay in memory, go only to the overlay of their own display and are
  dropped when drawing stops. Never written to disk, never sent anywhere.
- If capture fails, or macOS has not granted Screen Recording (which yields
  only the wallpaper), drawing starts over the live screen and the log says
  why.

## Consequences

The privacy statement changes from "does not capture your screen" to "only
when you turn on the freeze". On macOS the first freeze asks for Screen
Recording; on Linux under Wayland the desktop portal may ask which screen to
share. Starting drawing mode with the freeze on takes a few hundred
milliseconds and briefly hides existing ink.
