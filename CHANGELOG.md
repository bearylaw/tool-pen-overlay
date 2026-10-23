# Changelog

All notable changes to this project are documented here, by hand. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] - 2026-10-23

### Added

- Five drawing cursor styles to choose from in Settings → Drawing, each
  with a live preview: crosshair and tool, crosshair, tool icon, brush
  preview and spotlight. Standard and Large sizes apply to all of them.

### Changed

- The drawing cursor is easy to see on any background: every style is
  outlined dark under a light line, and a thin pen no longer gives a
  near-invisible cursor.

## [1.0.2] - 2026-10-23

### Added

- Tray menu: **Reset toolbar position** moves the toolbar to the middle of
  the main screen.
- A toolbar dropped within 16 px of a screen edge snaps flush to it.

### Fixed

- The toolbar no longer jumps up when it sits near the bottom of the screen
  and you pick the pen or start drawing. It stays exactly where you drop
  it, also over the taskbar.
- The toolbar has no shadow or transparent margin around it any more.

## [1.0.1] - 2026-10-23

### Fixed

- Drawing no longer lags more and more the longer you hold the pen down.
  Ink was painted once per input event (hundreds per second with a pen),
  which made the GPU fall behind; it is now painted once per display frame.
  On a 144 Hz display a 12,000-sample stroke keeps every frame at the
  refresh rate (worst frame 21 ms, before up to 458 ms).

### Removed

- The *Lowest latency* setting. Turning off vsync and the frame cap made
  the lag worse, not better.

## [1.0.0] - 2026-10-23

### Added

- Transparent drawing layer on every monitor, above other windows, with
  click-through when not drawing.
- Pen with tablet pressure, highlighter, line, arrow, rectangle, ellipse and
  stroke eraser; Shift for straight angles, squares and circles; the eraser
  end of a stylus erases.
- Low-latency input: raw pointer updates drawn immediately on low-latency
  canvases, a predicted tip that keeps the line under the pointer when
  drawing fast, finished strokes added without a full repaint, and an
  optional (default on) unsynchronised, uncapped frame mode.
- Undo, redo and clear across all monitors; hide and show drawings.
- Draggable toolbar, horizontal or vertical, full or compact (mouse, pen,
  highlighter, eraser, two colours, undo, redo, clear, hide, settings),
  75–200 % size, light, dark or system theme.
- Colour picker with hex input and eyedropper; named palettes you can add
  to, reorder, rename and delete; 1–9 select palette colours; right-click
  a colour on the toolbar to open the picker.
- Brush size per tool, 1–96 px, with presets and mouse-wheel adjustment.
- Global shortcuts, changeable in settings, with conflict detection.
- Per-user defaults: save the current tool as default and choose whether
  the app starts with it or with the last used tool.
- Settings export, import and reset; settings stored per user with
  per-field fallback for hand-edited files.
- Tray (menu bar) icon, launch at login, start in drawing mode, clear on
  stop.
- Keyboard and screen-reader support, high-contrast and reduced-motion
  support; English and German.
- Installers for Windows (NSIS, portable), macOS (universal DMG and ZIP) and
  Linux (AppImage, deb) built in CI.

[Unreleased]: https://github.com/bearylaw/tool-pen-overlay/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/bearylaw/tool-pen-overlay/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/bearylaw/tool-pen-overlay/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/bearylaw/tool-pen-overlay/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/bearylaw/tool-pen-overlay/releases/tag/v1.0.0
