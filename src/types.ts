export interface Novel {
  id: string;
  title: string;
  filename: string;
}

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  charsPerPage: number;
  darkMode: boolean;
}

export interface Chapter {
  title: string;
  offset: number;
}

export interface Bookmark {
  /** UTF-16 offset, matching String.slice and the existing reader_pos keys. */
  offset: number;
  text: string;
  timestamp: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
