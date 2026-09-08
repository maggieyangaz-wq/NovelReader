import { isRecord } from './types.ts';
import type { Novel } from './types.ts';

export function parseCatalog(value: unknown): Novel[] {
  if (!isRecord(value) || !Array.isArray(value.novels)) throw new Error('书库目录格式不正确');
  const ids = new Set<string>();
  return value.novels.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.filename !== 'string' || !item.filename.endsWith('.encrypted')
      || /[/\\]/.test(item.filename) || ids.has(item.id)) {
      throw new Error('书库目录包含无效或重复的小说记录');
    }
    ids.add(item.id);
    return { id: item.id, title: item.title, filename: item.filename };
  });
}

export async function loadCatalog(baseUrl: string): Promise<Novel[]> {
  const response = await fetch(`${baseUrl}novels/index.json`);
  if (!response.ok) throw new Error('书库加载失败，请检查网络后重试');
  const value: unknown = await response.json();
  return parseCatalog(value);
}

export async function loadEncryptedNovel(baseUrl: string, novel: Novel, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(`${baseUrl}novels/${encodeURIComponent(novel.filename)}`, { signal });
  if (!response.ok) throw new Error('文件加载失败，请检查网络后重试');
  return response.arrayBuffer();
}
