import { loadCatalog, loadEncryptedNovel } from './catalog.ts';
import { decryptNovel } from './crypto.ts';
import { Reader, parseChapters } from './reader.ts';
import { ReaderStorage } from './storage.ts';
import type { Bookmark, Chapter, Novel, ReaderSettings } from './types.ts';
import { byId, clickedButton, create, renderBookmarks, renderCatalog, renderChapters, setPanel, showMessage } from './ui.ts';

export class ReaderApp {
  private readonly baseUrl: string;
  private readonly storage: ReaderStorage;
  private settings: ReaderSettings;
  private novels: Novel[] = [];
  private novel: Novel | null = null;
  private reader: Reader | null = null;
  private chapters: Chapter[] = [];
  private bookmarks: Bookmark[] = [];
  private pendingNovel: Novel | null = null;
  private opener: HTMLButtonElement | null = null;
  private requestId = 0;
  private controller: AbortController | null = null;
  private busy = false;

  private readonly ui = {
    shelf: byId('novel-list-page', 'main'), grid: byId('novels-grid', 'div'),
    readerPage: byId('reader-page', 'main'), title: byId('reader-title', 'div'),
    content: byId('reader-content', 'div'), theme: byId('theme-btn', 'button'),
    home: byId('home-btn', 'button'), previous: byId('prev-btn', 'button'), next: byId('next-btn', 'button'),
    progress: byId('progress-bar', 'div'), fill: byId('progress-fill', 'div'), progressText: byId('progress-text', 'span'),
    passwordModal: byId('password-modal', 'div'), password: byId('password-input', 'input'),
    confirm: byId('password-confirm', 'button'), passwordError: byId('password-error', 'div'),
    settingsModal: byId('settings-modal', 'div'), font: byId('font-size-slider', 'input'),
    line: byId('line-height-slider', 'input'), size: byId('chars-per-page-slider', 'input'),
    toc: byId('toc-sidebar', 'aside'), tocList: byId('toc-list', 'div'),
    bookmarksPanel: byId('bookmarks-sidebar', 'aside'), bookmarksList: byId('bookmarks-list', 'div'),
    quickBookmark: byId('quick-bookmark-btn', 'button'),
  };

  constructor(baseUrl: string, storage?: ReaderStorage) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.storage = storage ?? new ReaderStorage(() => window.localStorage, () => {
      byId('storage-notice', 'div').hidden = false;
    });
    this.settings = this.storage.loadSettings();
  }

  async start(): Promise<void> {
    this.applySettings();
    this.bindEvents();
    await this.loadShelf();
  }

  private async loadShelf(): Promise<void> {
    showMessage(this.ui.grid, '正在加载书库…');
    try {
      this.novels = await loadCatalog(this.baseUrl);
      renderCatalog(this.ui.grid, this.novels);
    } catch (error) {
      showMessage(this.ui.grid, error instanceof Error ? error.message : '书库加载失败');
      const retry = create('button', 'footer-btn', '重新加载');
      retry.addEventListener('click', () => { void this.loadShelf(); });
      this.ui.grid.append(retry);
    }
  }

  private bindEvents(): void {
    this.ui.theme.addEventListener('click', () => {
      this.settings.darkMode = !this.settings.darkMode;
      this.applySettings();
      this.storage.saveSettings(this.settings);
    });
    this.ui.home.addEventListener('click', () => {
      this.closePassword();
      this.ui.readerPage.hidden = true;
      this.ui.shelf.hidden = false;
      for (const panel of [this.ui.toc, this.ui.bookmarksPanel, this.ui.settingsModal]) setPanel(panel, false);
    });
    this.ui.grid.addEventListener('click', event => {
      const button = clickedButton(event);
      const novel = this.novels.find(item => item.id === button?.dataset.novelId);
      if (!novel) return;
      this.pendingNovel = novel;
      this.opener = button;
      this.ui.password.value = '';
      this.ui.passwordError.textContent = '';
      setPanel(this.ui.passwordModal, true);
      this.ui.password.focus();
    });
    this.ui.confirm.addEventListener('click', () => { void this.submitPassword(); });
    this.ui.password.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); void this.submitPassword(); }
    });
    byId('password-cancel', 'button').addEventListener('click', () => this.closePassword());

    const panels = [
      ['toc-btn', 'toc-close', this.ui.toc],
      ['bookmark-btn', 'bookmarks-close', this.ui.bookmarksPanel],
      ['settings-btn', 'settings-close', this.ui.settingsModal],
    ] as const;
    for (const [open, close, panel] of panels) {
      byId(open, 'button').addEventListener('click', () => {
        setPanel(panel, !panel.classList.contains('active'));
        if (panel.classList.contains('active')) byId(close, 'button').focus();
      });
      byId(close, 'button').addEventListener('click', () => {
        setPanel(panel, false);
        byId(open, 'button').focus();
      });
    }

    this.ui.font.addEventListener('input', () => { this.settings.fontSize = Number(this.ui.font.value); this.settingsChanged(); });
    this.ui.line.addEventListener('input', () => { this.settings.lineHeight = Number(this.ui.line.value); this.settingsChanged(); });
    this.ui.size.addEventListener('input', () => {
      this.settings.charsPerPage = Number(this.ui.size.value);
      this.reader?.setPageSize(this.settings.charsPerPage);
      this.settingsChanged();
      this.renderBookmarkList();
      this.renderPage();
    });
    this.ui.previous.addEventListener('click', () => this.turnPage(-1));
    this.ui.next.addEventListener('click', () => this.turnPage(1));
    this.ui.progress.addEventListener('click', event => {
      if (!this.reader) return;
      const rect = this.ui.progress.getBoundingClientRect();
      if (rect.width <= 0) return;
      this.reader.goToPage(((event.clientX - rect.left) / rect.width) * this.reader.totalPages);
      this.renderPage();
    });
    this.ui.tocList.addEventListener('click', event => {
      const offset = clickedButton(event)?.dataset.offset;
      if (offset === undefined || !this.reader) return;
      this.reader.goToOffset(Number(offset));
      this.renderPage();
      setPanel(this.ui.toc, false);
    });
    this.ui.quickBookmark.addEventListener('click', () => {
      if (!this.reader) return;
      const index = this.bookmarks.findIndex(bookmark => this.reader?.contains(bookmark.offset));
      if (index >= 0) this.deleteBookmark(index); else this.addBookmark();
    });
    this.ui.bookmarksList.addEventListener('click', event => {
      const button = clickedButton(event);
      if (button?.dataset.delete !== undefined) this.deleteBookmark(Number(button.dataset.delete));
      if (button?.dataset.bookmark !== undefined && this.reader) {
        const bookmark = this.bookmarks[Number(button.dataset.bookmark)];
        if (!bookmark) return;
        this.reader.goToOffset(bookmark.offset);
        this.renderPage();
        setPanel(this.ui.bookmarksPanel, false);
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        this.closePassword();
        for (const panel of [this.ui.toc, this.ui.bookmarksPanel, this.ui.settingsModal]) setPanel(panel, false);
        return;
      }
      const editing = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
      if (this.ui.readerPage.hidden || editing || event.ctrlKey || event.metaKey || event.altKey
        || this.ui.settingsModal.classList.contains('active') || this.ui.passwordModal.classList.contains('active')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); this.turnPage(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.turnPage(-1); }
      if (event.key.toLowerCase() === 'b') { event.preventDefault(); this.addBookmark(); }
    });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.ui.confirm.disabled = busy;
    this.ui.password.disabled = busy;
    this.ui.confirm.textContent = busy ? '正在解密…' : '确认';
  }

  private closePassword(): void {
    const wasOpen = this.ui.passwordModal.classList.contains('active');
    this.requestId++;
    this.controller?.abort();
    this.controller = null;
    this.pendingNovel = null;
    this.ui.password.value = '';
    this.setBusy(false);
    setPanel(this.ui.passwordModal, false);
    if (wasOpen) this.opener?.focus();
  }

  private async submitPassword(): Promise<void> {
    const novel = this.pendingNovel;
    const password = this.ui.password.value;
    if (!novel || !password || this.busy) return;
    const id = ++this.requestId;
    this.controller = new AbortController();
    this.setBusy(true);
    this.ui.passwordError.textContent = '';
    try {
      const buffer = await loadEncryptedNovel(this.baseUrl, novel, this.controller.signal);
      if (id !== this.requestId) return;
      const text = await decryptNovel(buffer, password);
      if (id !== this.requestId) return;
      this.closePassword();
      this.openNovel(novel, text);
    } catch (error) {
      if (id !== this.requestId) return;
      this.ui.passwordError.textContent = error instanceof Error ? error.message : '加载失败，请重试';
    } finally {
      if (id === this.requestId) {
        this.setBusy(false);
        this.ui.password.focus();
      }
    }
  }

  private openNovel(novel: Novel, text: string): void {
    this.novel = novel;
    this.reader = new Reader(text, this.settings.charsPerPage, this.storage.loadPosition(novel.id, this.settings.charsPerPage, text.length));
    this.chapters = parseChapters(text);
    this.bookmarks = this.storage.loadBookmarks(novel.id, text, this.settings.charsPerPage);
    this.ui.title.textContent = novel.title;
    this.ui.shelf.hidden = true;
    this.ui.readerPage.hidden = false;
    renderChapters(this.ui.tocList, this.chapters);
    this.renderBookmarkList();
    this.renderPage();
    this.ui.content.focus({ preventScroll: true });
  }

  private applySettings(): void {
    document.body.classList.toggle('dark-mode', this.settings.darkMode);
    this.ui.theme.textContent = this.settings.darkMode ? '☀️ 日间模式' : '🌙 夜间模式';
    this.ui.theme.setAttribute('aria-pressed', String(this.settings.darkMode));
    this.ui.content.style.setProperty('--reader-font-size', `${this.settings.fontSize}px`);
    this.ui.content.style.setProperty('--reader-line-height', String(this.settings.lineHeight));
    this.ui.font.value = String(this.settings.fontSize);
    this.ui.line.value = String(this.settings.lineHeight);
    this.ui.size.value = String(this.settings.charsPerPage);
    byId('font-size-display', 'span').textContent = String(this.settings.fontSize);
    byId('line-height-display', 'span').textContent = this.settings.lineHeight.toFixed(1);
    byId('chars-per-page-display', 'span').textContent = String(this.settings.charsPerPage);
  }

  private settingsChanged(): void {
    this.applySettings();
    this.storage.saveSettings(this.settings);
  }

  private turnPage(direction: number): void {
    if (!this.reader) return;
    const page = this.reader.page + direction;
    if (page < 0 || page >= this.reader.totalPages) return;
    this.reader.goToPage(page);
    this.renderPage();
  }

  private renderPage(): void {
    if (!this.reader || !this.novel) return;
    const reader = this.reader;
    this.ui.content.textContent = reader.pageText || '这本小说暂无正文';
    this.ui.fill.style.width = `${reader.progress * 100}%`;
    this.ui.progressText.textContent = `进度: ${Math.round(reader.progress * 100)}% (${reader.page + 1}/${reader.totalPages})`;
    this.ui.previous.disabled = reader.page === 0;
    this.ui.next.disabled = reader.page >= reader.totalPages - 1;
    this.storage.savePosition(this.novel.id, reader.offset);
    this.ui.content.scrollTop = 0;
    window.scrollTo(0, 0);
    let active = -1;
    this.chapters.forEach((chapter, index) => { if (chapter.offset <= reader.offset) active = index; });
    this.ui.tocList.querySelectorAll<HTMLButtonElement>('.toc-item').forEach((button, index) => {
      button.classList.toggle('active', index === active);
      if (index === active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    });
    this.updateBookmarkButton();
  }

  private renderBookmarkList(): void { renderBookmarks(this.ui.bookmarksList, this.bookmarks, this.settings.charsPerPage); }

  private updateBookmarkButton(): void {
    const marked = this.bookmarks.some(bookmark => this.reader?.contains(bookmark.offset));
    this.ui.quickBookmark.textContent = marked ? '❤' : '♡';
    this.ui.quickBookmark.classList.toggle('is-bookmarked', marked);
    this.ui.quickBookmark.setAttribute('aria-pressed', String(marked));
    this.ui.quickBookmark.setAttribute('aria-label', marked ? '移除本页书签' : '添加本页书签');
  }

  private addBookmark(): void {
    if (!this.reader || !this.novel || !this.reader.text.length || this.bookmarks.some(bookmark => this.reader?.contains(bookmark.offset))) return;
    this.bookmarks.push({ offset: this.reader.offset, text: this.reader.text.slice(this.reader.offset, this.reader.offset + 100), timestamp: new Date().toLocaleString() });
    this.saveBookmarks();
  }

  private deleteBookmark(index: number): void {
    if (!Number.isInteger(index) || !this.bookmarks[index]) return;
    this.bookmarks.splice(index, 1);
    this.saveBookmarks();
  }

  private saveBookmarks(): void {
    if (!this.novel) return;
    this.storage.saveBookmarks(this.novel.id, this.bookmarks);
    this.renderBookmarkList();
    this.updateBookmarkButton();
  }
}
