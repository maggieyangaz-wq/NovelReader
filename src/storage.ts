import { migrateBookmarks } from './bookmarks.ts';
import { clampOffset } from './reader.ts';
import { isRecord } from './types.ts';
import type { Bookmark, ReaderSettings } from './types.ts';

export const DEFAULT_SETTINGS: Readonly<ReaderSettings> = {
  fontSize: 16, lineHeight: 1.8, charsPerPage: 1500, darkMode: false,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function numberSetting(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export class ReaderStorage {
  private readonly getStorage: () => StorageLike;
  private readonly onError: () => void;

  constructor(getStorage: () => StorageLike = () => window.localStorage, onError: () => void = () => {}) {
    this.getStorage = getStorage;
    this.onError = onError;
  }

  private read(key: string): string | null {
    try { return this.getStorage().getItem(key); }
    catch { this.onError(); return null; }
  }

  private write(key: string, value: string): boolean {
    try { this.getStorage().setItem(key, value); return true; }
    catch { this.onError(); return false; }
  }

  loadSettings(): ReaderSettings {
    return {
      fontSize: Math.round(numberSetting(this.read('reader_fontSize'), 16, 12, 24)),
      lineHeight: numberSetting(this.read('reader_lineHeight'), 1.8, 1.2, 2.5),
      charsPerPage: Math.round(numberSetting(this.read('reader_charsPerPage'), 1500, 500, 3000)),
      darkMode: this.read('reader_darkMode') === 'true',
    };
  }

  saveSettings(settings: ReaderSettings): void {
    for (const [name, value] of Object.entries(settings)) this.write(`reader_${name}`, String(value));
  }

  loadPosition(id: string, charsPerPage: number, textLength: number): number {
    const saved = this.read(`reader_pos_${id}`);
    const legacy = this.read(`reader_page_${id}`);
    const offset = saved !== null && Number.isFinite(Number(saved))
      ? Number(saved) : Number(legacy) * charsPerPage;
    return clampOffset(offset, textLength);
  }

  savePosition(id: string, offset: number): void { this.write(`reader_pos_${id}`, String(offset)); }

  loadBookmarks(id: string, text: string, charsPerPage: number): Bookmark[] {
    const raw = this.read(`bookmarks_${id}`);
    if (!raw) return [];
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return []; }
    const bookmarks = migrateBookmarks(value, text, charsPerPage);
    const hasLegacy = Array.isArray(value) && value.some(item => isRecord(item) && 'page' in item && !('offset' in item));
    if (hasLegacy) {
      const backupKey = `bookmarks_legacy_${id}`;
      const backedUp = this.read(backupKey) !== null || this.write(backupKey, raw);
      if (backedUp) this.saveBookmarks(id, bookmarks);
    }
    return bookmarks;
  }

  saveBookmarks(id: string, bookmarks: readonly Bookmark[]): void {
    this.write(`bookmarks_${id}`, JSON.stringify(bookmarks));
  }
}
