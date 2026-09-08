import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { ReaderApp } from '../src/app.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sample = '第一章 出发\n' + '甲'.repeat(4492) + '\n第二章 独特章节\n' + '乙'.repeat(4500);
const novel = { id: 'fixture', title: '迁移测试小说', filename: '测试.txt.encrypted' };
const password = 'fixture-password';

function encrypted(text: string): Uint8Array<ArrayBuffer> {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 300000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([Buffer.from('NVL2'), salt, iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return new Uint8Array(data);
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('UI did not reach the expected state');
}

async function setup(options: { entries?: Record<string, string>; text?: string; fetcher?: typeof fetch } = {}) {
  const dom = new JSDOM(html, { url: 'https://reader.example/SP-Novel-Reader/' });
  const globals = ['window', 'document', 'HTMLElement', 'Element'] as const;
  const descriptors = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  dom.window.scrollTo = () => {};
  for (const [key, value] of Object.entries(options.entries ?? {})) dom.window.localStorage.setItem(key, value);
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const data = encrypted(options.text ?? sample);
  globalThis.fetch = options.fetcher ?? (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === '/SP-Novel-Reader/novels/index.json') return Response.json({ novels: [novel] });
    if (url === `/SP-Novel-Reader/novels/${encodeURIComponent(novel.filename)}`) return new Response(data);
    return new Response('', { status: 404 });
  });
  const app = new ReaderApp('/SP-Novel-Reader/');
  await app.start();
  const get = <T extends HTMLElement>(id: string) => dom.window.document.getElementById(id) as T;
  const click = (id: string) => get<HTMLButtonElement>(id).click();
  const change = (id: string, value: string) => {
    get<HTMLInputElement>(id).value = value;
    get(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const requestOpen = (key = password) => {
    dom.window.document.querySelector<HTMLButtonElement>('.novel-card')!.click();
    get<HTMLInputElement>('password-input').value = key;
    click('password-confirm');
  };
  const open = async () => { requestOpen(); await until(() => !get('reader-page').hidden); };
  return {
    dom, get, click, change, requestOpen, open, requests,
    cleanup() {
      globalThis.fetch = originalFetch;
      for (const key of globals) {
        const descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
      dom.window.close();
    },
  };
}

test('open, restore settings, migrate bookmarks, repaginate and jump through the UI', async () => {
  const excerpt = sample.slice(4500, 4600);
  const ui = await setup({ entries: {
    reader_fontSize: '22', reader_lineHeight: '2.2', reader_charsPerPage: '700',
    reader_pos_fixture: '4500', bookmarks_fixture: JSON.stringify([{ page: 3, text: excerpt, timestamp: '旧记录' }]),
  } });
  try {
    await ui.open();
    assert.equal(ui.get('reader-content').style.getPropertyValue('--reader-font-size'), '22px');
    assert.equal(ui.get('reader-content').style.getPropertyValue('--reader-line-height'), '2.2');
    assert.equal(ui.get('reader-content').textContent, sample.slice(4200, 4900));
    assert.equal(ui.dom.window.localStorage.getItem('reader_pos_fixture'), '4500');
    assert.ok(ui.dom.window.localStorage.getItem('bookmarks_legacy_fixture'));
    ui.change('chars-per-page-slider', '1500');
    ui.click('next-btn');
    ui.click('bookmark-btn');
    ui.dom.window.document.querySelector<HTMLButtonElement>('[data-bookmark="0"]')!.click();
    assert.equal(ui.dom.window.localStorage.getItem('reader_pos_fixture'), '4500');
    assert.equal(ui.get('quick-bookmark-btn').getAttribute('aria-pressed'), 'true');
    assert.equal(ui.get('reader-content').textContent, sample.slice(4500, 6000));
    ui.click('theme-btn');
    assert.equal(ui.dom.window.localStorage.getItem('reader_darkMode'), 'true');
    assert.ok(ui.dom.window.document.body.classList.contains('dark-mode'));
    assert.ok(ui.requests.includes('/SP-Novel-Reader/novels/index.json'));
    assert.ok(ui.requests.includes(`/SP-Novel-Reader/novels/${encodeURIComponent(novel.filename)}`));
  } finally { ui.cleanup(); }
});

test('page controls, chapter navigation and bookmark add/remove use module event handlers', async () => {
  const ui = await setup();
  try {
    await ui.open();
    assert.equal(ui.get<HTMLButtonElement>('prev-btn').disabled, true);
    ui.click('next-btn');
    ui.click('quick-bookmark-btn');
    assert.equal(JSON.parse(ui.dom.window.localStorage.getItem('bookmarks_fixture')!)[0].offset, 1500);
    ui.click('quick-bookmark-btn');
    assert.deepEqual(JSON.parse(ui.dom.window.localStorage.getItem('bookmarks_fixture')!), []);
    ui.click('toc-btn');
    const secondChapter = ui.dom.window.document.querySelector<HTMLButtonElement>('.toc-item[data-offset="4500"]');
    assert.ok(secondChapter);
    secondChapter.click();
    assert.equal(ui.dom.window.localStorage.getItem('reader_pos_fixture'), '4500');
    assert.equal(secondChapter.getAttribute('aria-current'), 'true');
    ui.click('toc-btn');
    const chapter = ui.dom.window.document.querySelector<HTMLButtonElement>('.toc-item');
    assert.ok(chapter);
    chapter.click();
    assert.equal(ui.dom.window.localStorage.getItem('reader_pos_fixture'), '0');
    assert.equal(ui.get('toc-sidebar').classList.contains('active'), false);
    ui.click('settings-btn');
    ui.get('font-size-slider').dispatchEvent(new ui.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(ui.dom.window.localStorage.getItem('reader_pos_fixture'), '0');
    ui.click('home-btn');
    assert.equal(ui.get('reader-page').hidden, true);
    assert.equal(ui.get('novel-list-page').hidden, false);
  } finally { ui.cleanup(); }
});

test('wrong keys display an error and permit a successful retry', async () => {
  const ui = await setup();
  try {
    ui.requestOpen('incorrect-fixture-key');
    await until(() => !!ui.get('password-error').textContent);
    assert.match(ui.get('password-error').textContent!, /密码错误/);
    assert.equal(ui.get('reader-page').hidden, true);
    assert.equal(ui.get<HTMLButtonElement>('password-confirm').disabled, false);
    ui.get<HTMLInputElement>('password-input').value = password;
    ui.click('password-confirm');
    await until(() => !ui.get('reader-page').hidden);
    assert.equal(ui.get<HTMLInputElement>('password-input').value, '');
  } finally { ui.cleanup(); }
});

test('a fresh app instance restores progress, bookmarks and reading preferences', async () => {
  let entries: Record<string, string> = {};
  const first = await setup();
  try {
    await first.open();
    first.click('next-btn');
    first.click('quick-bookmark-btn');
    first.change('font-size-slider', '21');
    first.change('line-height-slider', '2.1');
    first.change('chars-per-page-slider', '700');
    first.click('theme-btn');
    const storage = first.dom.window.localStorage;
    entries = Object.fromEntries(Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index)!;
      return [key, storage.getItem(key)!];
    }));
  } finally { first.cleanup(); }
  const restored = await setup({ entries });
  try {
    await restored.open();
    assert.equal(restored.get('reader-content').textContent, sample.slice(1400, 2100));
    assert.equal(restored.get('reader-content').style.getPropertyValue('--reader-font-size'), '21px');
    assert.equal(restored.get('reader-content').style.getPropertyValue('--reader-line-height'), '2.1');
    assert.equal(restored.get('quick-bookmark-btn').getAttribute('aria-pressed'), 'true');
    assert.ok(restored.dom.window.document.body.classList.contains('dark-mode'));
  } finally { restored.cleanup(); }
});

test('cancelled asynchronous downloads cannot reopen the book', async () => {
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const ui = await setup({ fetcher: async input => String(input).endsWith('index.json') ? Response.json({ novels: [novel] }) : response });
  try {
    ui.requestOpen();
    ui.click('password-cancel');
    finish(new Response(encrypted(sample)));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ui.get('reader-page').hidden, true);
    assert.equal(ui.get('password-modal').classList.contains('active'), false);
    assert.equal(ui.get<HTMLButtonElement>('password-confirm').disabled, false);
  } finally { ui.cleanup(); }
});

test('empty novels render finite progress and disable both page controls', async () => {
  const ui = await setup({ text: '' });
  try {
    await ui.open();
    assert.equal(ui.get('progress-text').textContent, '进度: 100% (1/1)');
    assert.equal(ui.get<HTMLButtonElement>('prev-btn').disabled, true);
    assert.equal(ui.get<HTMLButtonElement>('next-btn').disabled, true);
  } finally { ui.cleanup(); }
});

test('catalog failures offer retry; titles and ids remain literal text', async () => {
  let calls = 0;
  const title = '<img src=x onerror=alert(1)>';
  const ui = await setup({ fetcher: async () => ++calls === 1
    ? new Response('', { status: 503 })
    : Response.json({ novels: [{ ...novel, id: "quote');alert(1)//", title }] }) });
  try {
    assert.match(ui.get('novels-grid').textContent!, /书库加载失败/);
    ui.dom.window.document.querySelector<HTMLButtonElement>('#novels-grid button')!.click();
    await until(() => !!ui.dom.window.document.querySelector('.novel-card'));
    assert.equal(ui.dom.window.document.querySelector('.novel-title')!.textContent, title);
    assert.equal(ui.get('novels-grid').querySelector('img'), null);
    assert.equal(ui.get('novels-grid').querySelector('[onclick]'), null);
  } finally { ui.cleanup(); }
});
