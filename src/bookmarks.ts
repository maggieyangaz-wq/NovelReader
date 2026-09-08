import { clampOffset } from './reader.ts';
import { isRecord } from './types.ts';
import type { Bookmark } from './types.ts';

function nearestMatch(text: string, excerpt: string, estimate: number): number | undefined {
  if (!excerpt) return undefined;
  let nearest: number | undefined;
  let found = text.indexOf(excerpt);
  while (found !== -1) {
    if (nearest === undefined || Math.abs(found - estimate) < Math.abs(nearest - estimate)) nearest = found;
    found = text.indexOf(excerpt, found + 1);
  }
  return nearest;
}

/** Old bookmarks contain page + excerpt but no original page size. The excerpt
 * is the best available anchor. Preserve the old raw data before saving this. */
export function migrateBookmarks(value: unknown, text: string, charsPerPage: number): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const result: Bookmark[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const excerpt = typeof item.text === 'string' ? item.text : '';
    let offset: number;
    if (typeof item.offset === 'number' && Number.isFinite(item.offset) && item.offset >= 0) {
      offset = item.offset;
    } else if (typeof item.page === 'number' && Number.isFinite(item.page) && item.page >= 0) {
      const estimate = Math.floor(item.page) * charsPerPage;
      offset = nearestMatch(text, excerpt, estimate) ?? estimate;
    } else {
      continue;
    }
    offset = clampOffset(offset, text.length);
    if (result.some(bookmark => bookmark.offset === offset)) continue;
    result.push({
      offset,
      text: excerpt || text.slice(offset, offset + 100),
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
    });
  }
  return result;
}
