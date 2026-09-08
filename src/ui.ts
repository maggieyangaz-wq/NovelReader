import type { Bookmark, Chapter, Novel } from './types.ts';

export function byId<K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K] {
  const element = document.getElementById(id);
  if (!element || element.tagName.toLowerCase() !== tag) throw new Error(`缺少页面元素: ${id}`);
  return element as HTMLElementTagNameMap[K];
}

export function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function showMessage(container: HTMLElement, text: string): void {
  container.replaceChildren(create('div', 'empty-state', text));
}

export function renderCatalog(container: HTMLElement, novels: readonly Novel[]): void {
  if (!novels.length) { showMessage(container, '书库中还没有小说'); return; }
  container.replaceChildren(...novels.map(novel => {
    const card = create('button', 'novel-card');
    card.type = 'button';
    card.dataset.novelId = novel.id;
    card.setAttribute('aria-label', `阅读《${novel.title}》`);
    const cover = create('span', 'novel-cover');
    cover.append(create('span', 'novel-cover-text', novel.title));
    const info = create('span', 'novel-info');
    info.append(create('span', 'novel-title', novel.title), create('span', 'novel-status', '点击开始阅读'));
    card.append(cover, info);
    return card;
  }));
}

export function renderChapters(container: HTMLElement, chapters: readonly Chapter[]): void {
  if (!chapters.length) { showMessage(container, '未检测到章节目录'); return; }
  container.replaceChildren(...chapters.map(chapter => {
    const button = create('button', 'toc-item', chapter.title);
    button.type = 'button';
    button.dataset.offset = String(chapter.offset);
    return button;
  }));
}

export function renderBookmarks(container: HTMLElement, bookmarks: readonly Bookmark[], charsPerPage: number): void {
  if (!bookmarks.length) { showMessage(container, '还没有书签'); return; }
  container.replaceChildren(...bookmarks.map((bookmark, index) => {
    const item = create('div', 'bookmark-item');
    const title = create('div', 'bookmark-title', `第 ${Math.floor(bookmark.offset / charsPerPage) + 1} 页 • ${bookmark.timestamp}`);
    const excerpt = create('div', 'bookmark-text', `“${bookmark.text.slice(0, 50)}…”`);
    const remove = create('button', 'bookmark-delete', '删除');
    remove.type = 'button';
    remove.dataset.delete = String(index);
    const jump = create('button', 'footer-btn bookmark-jump', '跳转');
    jump.type = 'button';
    jump.dataset.bookmark = String(index);
    item.append(title, excerpt, remove, jump);
    return item;
  }));
}

export function clickedButton(event: Event): HTMLButtonElement | null {
  return event.target instanceof Element ? event.target.closest('button') : null;
}

export function setPanel(panel: HTMLElement, active: boolean): void {
  panel.classList.toggle('active', active);
  panel.inert = !active;
  panel.setAttribute('aria-hidden', String(!active));
}
