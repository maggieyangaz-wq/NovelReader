#!/usr/bin/env node
const fs = require('fs');
const { webcrypto: crypto } = require('crypto');

const PASSWORD = 'spankingisgreat';

async function deriveKey(password) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const key = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('salt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        key,
        { name: 'AES-CBC', length: 256 },
        false,
        ['decrypt']
    );
}

async function testDecryptNovel() {
    try {
        console.log('=== 测试实际小说文件解密 ===\n');

        // 读取加密小说
        const encryptedBuffer = fs.readFileSync('novels/test-novel1.txt.encrypted');
        console.log('小说文件大小:', encryptedBuffer.length, '字节');

        // 分离 IV 和密文
        const iv = new Uint8Array(encryptedBuffer.slice(0, 16));
        const encrypted = new Uint8Array(encryptedBuffer.slice(16));

        console.log('IV 大小:', iv.length);
        console.log('密文大小:', encrypted.length);
        console.log('');

        // 派生密钥
        const key = await deriveKey(PASSWORD);

        // 解密
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: iv },
            key,
            encrypted
        );

        const decoder = new TextDecoder();
        const text = decoder.decode(decrypted);

        console.log('=== ✓ 解密成功！ ===');
        console.log('内容长度:', text.length, '字符');
        console.log('前 200 个字符:');
        console.log(text.substring(0, 200));
        console.log('...');
    } catch (err) {
        console.error('=== ✗ 解密失败 ===');
        console.error('错误:', err.message);
    }
}

testDecryptNovel();
