#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PASSWORD = 'spankingisgreat';
const NOVELS_DIR = './novels';

function encryptFile(inputPath) {
  const fileName = path.basename(inputPath);
  const outputPath = path.join(NOVELS_DIR, fileName + '.encrypted');

  // 生成随机 IV
  const iv = crypto.randomBytes(16);

  // 从密码生成密钥（32字节用于 AES-256）
  const key = crypto.scryptSync(PASSWORD, 'salt', 32);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);

  // IV 和加密内容都写到输出文件
  output.write(iv);

  input.pipe(cipher).pipe(output);

  return new Promise((resolve, reject) => {
    output.on('finish', () => {
      console.log(`✓ 加密完成: ${fileName} -> ${fileName}.encrypted`);
      resolve();
    });
    output.on('error', reject);
  });
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('使用方法: node encrypt-novel.js <文件路径>');
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
    await encryptFile(filePath);
  } catch (err) {
    console.error('加密失败:', err.message);
    process.exit(1);
  }
}

main();
