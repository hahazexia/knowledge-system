const fs = require('fs').promises;
const path = require('path');

/**
 * 生成目录结构
 * @param {string} dir 要遍历的目录路径
 * @param {string} prefix 前缀字符串，用于格式化输出
 * @param {boolean} isLast 是否为最后一个元素
 * @returns {Promise<string>} 目录结构字符串
 */
async function generateStructure(dir, prefix = '', isLast = true) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const filteredEntries = entries.filter(entry => {
      const name = entry.name;

      return (
        !name.startsWith('.') &&
        !['node_modules', 'dist', 'coverage'].includes(name)
      );
    });

    filteredEntries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    let structure = '';

    for (let i = 0; i < filteredEntries.length; i++) {
      const entry = filteredEntries[i];
      const isLastEntry = i === filteredEntries.length - 1;
      const entryName = entry.name;
      const entryPath = path.join(dir, entryName);

      const connector = isLast ? '└─' : '├─';
      structure += `${prefix}${connector}${entryName}\n`;

      if (entry.isDirectory()) {
        const newPrefix = isLast ? `${prefix}  ` : `${prefix}│ `;
        structure += await generateStructure(entryPath, newPrefix, isLastEntry);
      }
    }

    return structure;
  } catch (err) {
    console.error('生成目录结构时出错:', err);
    return '';
  }
}

async function main() {
  const targetDir = process.argv[2] || './';

  try {
    console.log(path.resolve(targetDir));
    const structure = await generateStructure(targetDir);
    console.log(structure);
  } catch (err) {
    console.error('执行出错:', err);
  }
}

main();
