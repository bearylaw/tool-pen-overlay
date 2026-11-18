import { desktopCapturer, screen, systemPreferences } from 'electron';
import type { Logger } from './logger';
import { captureSize, pairSources } from './snapshot';

/** JPEG keeps a 4K frame small and quick to encode; at 95 text stays crisp. */
const JPEG_QUALITY = 95;

/**
 * Takes one still image of every display, for the screen freeze. Images stay
 * in memory and go only to the overlay of their own display (decision 0006).
 * The caller hides the app's own windows first. Returns an empty map when
 * capture is unavailable, so drawing goes on over the live screen.
 */
export async function captureDisplays(log: Logger): Promise<Map<number, Uint8Array>> {
  const displays = screen.getAllDisplays();
  const frames = new Map<number, Uint8Array>();
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: captureSize(
        displays.map((d) => ({ id: d.id, ...d.size, scaleFactor: d.scaleFactor })),
      ),
    });
    // Without the Screen Recording permission macOS returns the wallpaper
    // only; freezing on that would hide everything the user wants to mark up.
    if (
      process.platform === 'darwin' &&
      systemPreferences.getMediaAccessStatus('screen') !== 'granted'
    ) {
      log.warn('freeze.no-permission');
      return frames;
    }
    const pairs = pairSources(
      displays.map((d) => d.id),
      sources,
    );
    for (const [id, source] of pairs) {
      if (!source.thumbnail.isEmpty()) frames.set(id, source.thumbnail.toJPEG(JPEG_QUALITY));
    }
    if (frames.size < displays.length)
      log.warn('freeze.partial', { displays: displays.length, frozen: frames.size });
  } catch (error) {
    log.error('freeze.capture-failed', error);
  }
  return frames;
}
