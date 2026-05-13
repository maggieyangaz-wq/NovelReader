#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');

const PASSWORD = 'spankingisgreat';

// 测试加密和解密流程
async function test() {
  const testText = '这是一个测试文本';
  console.log('原文:', testText);

  // 1. 加密
  const iv = crypto.randomBytes(16);
  const salt = Buffer.from('salt');
  const key = crypto.pbkdf2Sync(PASSWORD, salt, 100000, 32, 'sha256');

  console.log('密钥 (hex):', key.toString('hex'));

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(testText, 'utf8', 'binary');
  encrypted += cipher.final('binary');

  const encryptedBuffer = Buffer.concat([iv, Buffer.from(encrypted, 'binary')]);
  console.log('加密后大小:', encryptedBuffer.length, '字节');

  // 2. 解密 (Node.js 端)
  const extractedIv = encryptedBuffer.slice(0, 16);
  const encryptedData = encryptedBuffer.slice(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, extractedIv);
  let decrypted = decipher.update(encryptedData, 'binary', 'utf8');
  decrypted += decipher.final('utf8');

  console.log('解密后:', decrypted);
  console.log('解密成功:', testText === decrypted);

  // 3. 保存用于前端测试
  fs.writeFileSync('test-encrypted.bin', encryptedBuffer);
  console.log('\n已保存加密文件: test-encrypted.bin');
  console.log('密码: spankingisgreat');
}

test().catch(console.error);
