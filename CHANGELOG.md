# Changelog

All notable changes to this project are documented here, by hand. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-23

### Added

- Transparent drawing layer on every monitor, above other windows, with
  click-through when not drawing.
- Pen with tablet pressure, highlighter, line, arrow, rectangle, ellipse and
  stroke eraser; Shift for straight angles, squares and circles; the eraser
  end of a stylus erases.
- Low-latency input: raw pointer updates, coalesced samples, low-latency
  canvases and predicted strokes.
- Undo, redo and clear across all monitors; hide and show drawings.
- Draggable toolbar, horizontal or vertical, 75–200 % size, light, dark or
  system theme.
- Colour picker with hex input and eyedropper; named palettes you can add
  to, reorder, rename and delete; 1–9 select palette colours.
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

[Unreleased]: https://github.com/bearylaw/tool-pen-overlay/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bearylaw/tool-pen-overlay/releases/tag/v1.0.0
