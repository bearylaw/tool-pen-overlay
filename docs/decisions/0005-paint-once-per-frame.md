# Paint live ink once per display frame, with vsync on

- Status: accepted
- Date: 2026-10-23
- Supersedes: [0004](0004-low-latency-ink.md)

## Context

With 1.0.0, drawing with a pen on Windows lagged more and more the longer a
stroke lasted. Each `pointerrawupdate` (200 Hz and more from a pen) painted
onto full-screen `desynchronized` canvases, so every event produced a frame,
and the *Lowest latency* setting (default on) disabled vsync and the frame
cap. The GPU and the system compositor fell behind and frames queued up.
A synthetic benchmark (`scripts/bench.mjs`) showed frames stalling for up to
458 ms, and capped at 60 fps with the switches on, on a 144 Hz display;
input itself was handled in under 1 ms throughout.

## Considered options

1. Keep painting per event and drop only the switches.
2. Record samples per event, paint once per `requestAnimationFrame`, on
   ordinary canvases, with vsync on, and keep the predicted tip.

## Decision

Option 2. Samples are still taken from `pointerrawupdate`, so the newest
one is used when the frame is painted; the tip is predicted 12 ms ahead to
cover the frame wait. Eraser hits repaint the ink layer at most once per
frame as well. The *Lowest latency* setting and its Chromium switches are
removed.

## Consequences

The amount of GPU work per second is bounded by the refresh rate however fast
the pen reports. The benchmark shows every frame at the refresh rate on a
12,000-sample stroke (worst 21 ms). Ink may appear up to one frame later than
a perfect per-event present would allow; the prediction hides most of that.
Settings files from 1.0.0 that contain `lowLatency` load fine; the field is
dropped.
