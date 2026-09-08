import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { decryptNovel } from '../src/crypto.ts';

test('the existing encryption CLI produces files the TypeScript reader can decrypt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'reader-crypto-'));
  const plaintext = '第一章 测试\n这是一份自动生成的验证文本。\n第二章 回家\n完。';
  // This password belongs only to this generated test fixture.
  const password = 'fixture-password';
  try {
    writeFileSync(join(directory, 'sample.txt'), plaintext);
    execFileSync(process.execPath, [fileURLToPath(new URL('../encrypt-novel.js', import.meta.url)), 'sample.txt'], {
      cwd: directory, env: { ...process.env, NOVEL_PASSWORD: password }, stdio: 'pipe',
    });
    const data = new Uint8Array(readFileSync(join(directory, 'novels/sample.txt.encrypted')));
    assert.equal(await decryptNovel(data.buffer, password), plaintext);
    await assert.rejects(decryptNovel(data.buffer, 'wrong-fixture-password'), /密码错误/);
    const damaged = data.slice();
    damaged[40] = damaged[40]! ^ 1;
    await assert.rejects(decryptNovel(damaged.buffer, password), /已损坏/);
    await assert.rejects(decryptNovel(data.slice(0, 20).buffer, password), /格式/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
