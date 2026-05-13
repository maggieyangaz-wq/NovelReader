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

async function testDecrypt() {
    try {
        console.log('=== 前端 WebCrypto 解密测试 ===\n');

        // 读取加密文件
        const encryptedBuffer = fs.readFileSync('test-encrypted.bin');
        console.log('加密文件大小:', encryptedBuffer.length, '字节');

        // 分离 IV 和密文
        const iv = new Uint8Array(encryptedBuffer.slice(0, 16));
        const encrypted = new Uint8Array(encryptedBuffer.slice(16));

        console.log('IV:', Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''));
        console.log('密文大小:', encrypted.length, '字节\n');

        // 派生密钥
        console.log('派生密钥...');
        const key = await deriveKey(PASSWORD);
        console.log('密钥派生成功\n');

        // 解密
        console.log('正在解密...');
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: iv },
            key,
            encrypted
        );

        const decoder = new TextDecoder();
        const text = decoder.decode(decrypted);

        console.log('=== ✓ 解密成功！ ===');
        console.log('解密内容:', text);
    } catch (err) {
        console.error('=== ✗ 解密失败 ===');
        console.error('错误信息:', err.message);
        console.error('错误栈:', err.stack);
    }
}

testDecrypt();
