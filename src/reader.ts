import type { Chapter } from './types.ts';

export function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(Number.isFinite(offset) ? Math.floor(offset) : 0, Math.max(0, length - 1)));
}

export class Reader {
  readonly text: string;
  offset: number;
  private pageSize: number;

  constructor(text: string, charsPerPage: number, offset = 0) {
    this.text = text;
    this.pageSize = this.validPageSize(charsPerPage);
    this.offset = clampOffset(offset, text.length);
  }

  private validPageSize(value: number): number {
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1500;
  }

  get charsPerPage(): number { return this.pageSize; }
  get totalPages(): number { return Math.max(1, Math.ceil(this.text.length / this.pageSize)); }
  get page(): number { return Math.floor(this.offset / this.pageSize); }
  get pageStart(): number { return this.page * this.pageSize; }
  get pageEnd(): number { return Math.min(this.pageStart + this.pageSize, this.text.length); }
  get pageText(): string { return this.text.slice(this.pageStart, this.pageEnd); }
  get progress(): number { return (this.page + 1) / this.totalPages; }

  setPageSize(value: number): void {
    this.pageSize = this.validPageSize(value);
    // Keep the exact anchor; rounding to the new page start loses position.
  }

  goToPage(page: number): void {
    const validPage = Number.isFinite(page) ? Math.floor(page) : 0;
    this.offset = Math.max(0, Math.min(validPage, this.totalPages - 1)) * this.pageSize;
  }

  goToOffset(offset: number): void { this.offset = clampOffset(offset, this.text.length); }
  contains(offset: number): boolean {
    return Math.floor(clampOffset(offset, this.text.length) / this.pageSize) === this.page;
  }
}

export function parseChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const title = line.trim();
    if (/^(第.{0,10}[章节回]|\.?[0-9]+\.?|Chapter|CHAPTER|\[.+\])/i.test(title) && title.length > 2) {
      chapters.push({ title, offset });
    }
    offset += line.length + 1;
  }
  return chapters;
}
