/** IPC channel names. One place, so preload and main cannot drift apart. Kept free of
 * dependencies because the preload bundle imports it. */
export const CHANNELS = {
  command: 'pen:command',
  intent: 'pen:intent',
  state: 'pen:state',
  size: 'pen:size',
  inkReport: 'pen:ink-report',
  inkOrder: 'pen:ink-order',
} as const;
