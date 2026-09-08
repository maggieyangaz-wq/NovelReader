/** Compatible with encrypt-novel.js: NVL2 | salt(16) | IV(12) | ciphertext | tag(16). */
export async function decryptNovel(buffer: ArrayBuffer, password: string): Promise<string> {
  if (!crypto.subtle) throw new Error('此浏览器无法解密，请通过 HTTPS 使用现代浏览器打开阅读器');
  const data = new Uint8Array(buffer);
  if (data.length < 48 || new TextDecoder().decode(data.slice(0, 4)) !== 'NVL2') {
    throw new Error('小说文件格式不正确或已损坏');
  }
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: data.slice(4, 20), iterations: 300000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.slice(20, 32) }, key, data.slice(32),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // Authentication failure cannot distinguish a wrong password from tampering.
    throw new Error('密码错误或小说文件已损坏');
  }
}
