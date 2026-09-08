import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Reader, parseChapters } from '../src/reader.ts';
import { migrateBookmarks } from '../src/bookmarks.ts';
import { ReaderStorage } from '../src/storage.ts';
import { parseCatalog } from '../src/catalog.ts';

test('changing page size repeatedly keeps the exact character anchor', () => {
  const reader = new Reader('文'.repeat(10000), 1500, 4501);
  reader.setPageSize(700);
  assert.equal(reader.offset, 4501);
  assert.equal(reader.page, 6);
  assert.equal(reader.pageText.length, 700);
  reader.setPageSize(3000);
  reader.setPageSize(1500);
  assert.equal(reader.offset, 4501);
  assert.equal(reader.page, 3);
  reader.goToPage(4);
  assert.equal(reader.offset, 6000);
});

test('empty books and out-of-range navigation never produce invalid progress', () => {
  const reader = new Reader('', 0, Infinity);
  assert.equal(reader.totalPages, 1);
  assert.equal(reader.progress, 1);
  reader.goToPage(100);
  assert.equal(reader.offset, 0);
  const last = new Reader('书'.repeat(1501), 1500);
  last.goToPage(10);
  assert.equal(last.page, 1);
  assert.equal(last.pageText, '书');
  last.goToPage(-1);
  assert.equal(last.page, 0);
});

test('chapter offsets include original CRLF characters', () => {
  const text = '前言\r\n第一章 出发\r\n正文\r\nChapter 2 Home\n终章';
  const chapters = parseChapters(text);
  assert.deepEqual(chapters, [
    { title: '第一章 出发', offset: text.indexOf('第一章') },
    { title: 'Chapter 2 Home', offset: text.indexOf('Chapter 2') },
  ]);
});

test('legacy bookmark excerpts locate the original text after page-size changes', () => {
  const text = '前'.repeat(4500) + '旧书签的独特原文' + '后'.repeat(3000);
  const migrated = migrateBookmarks([{ page: 3, text: '旧书签的独特原文', timestamp: '昨天' }], text, 700);
  assert.deepEqual(migrated, [{ offset: 4500, text: '旧书签的独特原文', timestamp: '昨天' }]);
  const reader = new Reader(text, 700);
  reader.goToOffset(migrated[0]!.offset);
  assert.ok(reader.pageText.includes('旧书签的独特原文'));
  reader.setPageSize(1500);
  assert.equal(reader.offset, 4500);
});

test('legacy bookmark migration handles duplicate excerpts, missing text and invalid records', () => {
  const text = 'ABC' + '文'.repeat(997) + 'ABC' + '文'.repeat(997);
  const migrated = migrateBookmarks([
    { page: 1, text: 'ABC' }, { page: 100, text: '不再存在' },
    { offset: 12, text: '<script>literal</script>' }, null, {}, { page: -1 },
  ], text, 1000);
  assert.deepEqual(migrated.map(item => item.offset), [1000, 1999, 12]);
});

test('existing settings and progress keys are preserved; malformed values use bounded defaults', () => {
  const entries = new Map<string, string>([
    ['reader_fontSize', '22'], ['reader_lineHeight', '2.2'], ['reader_charsPerPage', '700'],
    ['reader_darkMode', 'true'], ['reader_pos_book', '4501'], ['reader_page_legacy', '3'],
  ]);
  const storage = new ReaderStorage(() => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } }));
  assert.deepEqual(storage.loadSettings(), { fontSize: 22, lineHeight: 2.2, charsPerPage: 700, darkMode: true });
  assert.equal(storage.loadPosition('book', 700, 10000), 4501);
  assert.equal(storage.loadPosition('legacy', 700, 10000), 2100);
  entries.set('reader_charsPerPage', 'NaN');
  entries.set('reader_fontSize', '100');
  assert.equal(storage.loadSettings().charsPerPage, 1500);
  assert.equal(storage.loadSettings().fontSize, 24);
  storage.savePosition('book', 4000);
  assert.equal(entries.get('reader_pos_book'), '4000');
});

test('legacy bookmarks are backed up once before conversion; corrupt JSON does not block opening', () => {
  const raw = JSON.stringify([{ page: 1, text: '独特书签', timestamp: '原日期' }]);
  const entries = new Map([['bookmarks_book', raw]]);
  const storage = new ReaderStorage(() => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } }));
  const text = '文'.repeat(1500) + '独特书签';
  assert.equal(storage.loadBookmarks('book', text, 700)[0]?.offset, 1500);
  assert.equal(entries.get('bookmarks_legacy_book'), raw);
  storage.loadBookmarks('book', text, 3000);
  assert.equal(entries.get('bookmarks_legacy_book'), raw);
  entries.set('bookmarks_corrupt', '{broken');
  assert.deepEqual(storage.loadBookmarks('corrupt', text, 700), []);
});

test('unavailable browser storage still permits reading', () => {
  let failures = 0;
  const storage = new ReaderStorage(() => { throw new Error('blocked'); }, () => failures++);
  assert.equal(storage.loadSettings().fontSize, 16);
  assert.equal(storage.loadPosition('book', 1500, 100), 0);
  storage.savePosition('book', 10);
  assert.ok(failures > 0);
});

test('catalog validation rejects missing fields, duplicate ids and nested asset paths', () => {
  const novel = { id: '1', title: '测试', filename: '测试.txt.encrypted' };
  assert.deepEqual(parseCatalog({ novels: [novel] }), [novel]);
  assert.throws(() => parseCatalog({ novels: [novel, novel] }));
  assert.throws(() => parseCatalog({ novels: [{ ...novel, filename: '../test.encrypted' }] }));
  assert.throws(() => parseCatalog({ novels: [{}] }));
});
