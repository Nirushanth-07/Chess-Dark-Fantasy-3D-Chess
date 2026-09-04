import { contextBridge } from 'electron';

/**
 * The renderer is a plain browser app today, so the bridge is intentionally
 * near-empty. It exists so that when the game needs saved games or settings on
 * disk, there is already one audited place for it.
 */
const api = {
  platform: process.platform,
  version: process.versions.electron,
};

contextBridge.exposeInMainWorld('desktop', api);

export type DesktopApi = typeof api;
