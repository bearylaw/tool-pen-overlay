# Draw on raw pointer updates with a predicted tip and no vsync

- Status: accepted
- Date: 2026-10-23

## Context

Ink must follow the pen with no visible lag, also when drawing fast. The
first version drew a smoothed curve that by construction ends half a sample
behind the pointer, relied on `getPredictedEvents` (empty for
`pointerrawupdate`, so the gap was never closed), cleared the whole
full-screen prediction layer on every event, and repainted every stroke
when one was finished.

## Considered options

1. `pointermove` with browser-predicted events: predictions, but events
   arrive once per frame, a frame later than raw updates.
2. `pointerrawupdate`, drawing each sample immediately, plus an own
   velocity-based prediction (`predictPoint` in `src/shared/ink.ts`).
3. A native drawing surface per platform: lowest latency, three codebases.

## Decision

Option 2, together with:

- a tip layer that draws the last half-segment and a prediction about
  10 ms ahead, cleared only where it was drawn;
- the live layers as `desynchronized` canvases, with opacity applied to
  their group only for the highlighter;
- finished strokes painted onto the ink layer on their own, without a full
  repaint;
- Chromium's `disable-gpu-vsync` and `disable-frame-rate-limit` switches,
  behind the *Lowest latency* setting (default on, read at launch).

## Consequences

Ink stays under the pointer at speed. With vsync off a fast stroke can
tear for a frame; idle windows produce no frames, so there is no idle cost
(measured: no CPU time over 10 s idle). Over-prediction shows briefly as a
short overshoot when the pointer stops abruptly; the prediction is capped
at four line widths. If tearing bothers someone, the setting turns the
switches off.
