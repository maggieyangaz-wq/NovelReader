#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 密钥从环境变量读取，不写入源代码：
//   NOVEL_PASSWORD=你的密钥 node encrypt-novel.js <文件路径>
const PASSWORD = process.env.NOVEL_PASSWORD;
const NOVELS_DIR = './novels';

// 文件格式: NVL2(4字节魔数) | salt(16) | iv(12) | 密文 | GCM认证标签(16)
const MAGIC = Buffer.from('NVL2');
const ITERATIONS = 300000;

function encryptFile(inputPath) {
  const fileName = path.basename(inputPath);
  const outputPath = path.join(NOVELS_DIR, fileName + '.encrypted');

  const plain = fs.readFileSync(inputPath);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(PASSWORD, salt, ITERATIONS, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  // WebCrypto 的 AES-GCM 要求认证标签紧跟在密文末尾
  fs.writeFileSync(outputPath, Buffer.concat([MAGIC, salt, iv, ciphertext, tag]));
  console.log(`✓ 加密完成: ${fileName} -> ${fileName}.encrypted`);
}

function main() {
  const filePath = process.argv[2];

  if (!PASSWORD) {
    console.error('未设置密钥，请通过环境变量传入: NOVEL_PASSWORD=你的密钥 node encrypt-novel.js <文件路径>');
    process.exit(1);
  }

  if (!filePath) {
    console.error('使用方法: NOVEL_PASSWORD=你的密钥 node encrypt-novel.js <文件路径>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(NOVELS_DIR)) {
    fs.mkdirSync(NOVELS_DIR, { recursive: true });
  }

  try {
    encryptFile(filePath);
  } catch (err) {
    console.error('加密失败:', err.message);
    process.exit(1);
  }
}

main();
