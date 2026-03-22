#!/usr/bin/env node
/**
 * scripts/clean.js
 *
 * 清理项目，只保留源代码和脚本
 * 运行: npm run clean
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 需要删除的目录
const DIRS_TO_DELETE = [
  'node_modules',
  'dist',
  'data',
  'download',
  'resources',
  'vendor',
];

// 需要删除的文件
const FILES_TO_DELETE = [
  'nul',
  'launcher.log',
  'package-lock.json',
  '.gitignore'
];

// 保留的文件（白名单）
const KEEP_FILES = [
  'main.js',
  'preload.js',
  'auto.js',
  'splash.html',
  'package.json',
  '.npmrc',
  'README.md',
  'launcher.bat',
  'dev.bat',
  'scripts',
];

function deleteDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✓ 删除目录: ${path.basename(dirPath)}`);
      return true;
    } catch (e) {
      console.log(`✗ 无法删除 ${path.basename(dirPath)}: ${e.message}`);
      return false;
    }
  }
  return false;
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`✓ 删除文件: ${path.basename(filePath)}`);
      return true;
    } catch (e) {
      console.log(`✗ 无法删除 ${path.basename(filePath)}: ${e.message}`);
      return false;
    }
  }
  return false;
}

console.log('╔══════════════════════════════════════════╗');
console.log('║   清理项目                                ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

let deletedCount = 0;

// 删除目录
console.log('删除目录...');
for (const dir of DIRS_TO_DELETE) {
  if (deleteDir(path.join(ROOT, dir))) {
    deletedCount++;
  }
}

// 删除文件
console.log('\n删除文件...');
for (const file of FILES_TO_DELETE) {
  if (deleteFile(path.join(ROOT, file))) {
    deletedCount++;
  }
}

// 显示保留的文件
console.log('\n保留的文件:');
for (const file of KEEP_FILES) {
  const filePath = path.join(ROOT, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  - ${file} (不存在)`);
  }
}

console.log('\n╔══════════════════════════════════════════╗');
console.log(`║   清理完成！删除了 ${deletedCount} 个项目`);
console.log('║                                           ║');
console.log('║   下一步：                                ║');
console.log('║   1. npm install      安装依赖            ║');
console.log('║   2. npm run setup    下载ST和酒馆助手    ║');
console.log('║   3. 放入 auto.js                        ║');
console.log('║   3. npm install                         ║');
console.log('║   4. npm start        启动应用            ║');
console.log('╚══════════════════════════════════════════╝');
