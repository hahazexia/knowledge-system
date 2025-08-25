# 集成日志

主进程一般需要记录日志，方便查错。这里选用 `electron-log` 这个库。`electron-log` 官方没有提供日志滚动的功能，需要通过 `archiveLogFn` 自己实现

```ts
import { app } from 'electron';
import path from 'node:path';
import { format } from 'date-fns';
import fs from 'node:fs';
import log from 'electron-log';

let isInitialized = false;
let fileLimit = 5;  // 日志文件保留的最大数量（超过会自动删除旧文件）

function initLogger(): any {
  if (isInitialized) {
    return log;
  }

  log.transports.file.level = 'info'; // 文件日志只记录 'info' 及以上级别（info/warn/error）
  log.transports.console.level = 'silly';  // 控制台日志记录所有级别（最详细）

  const logPath = path.join(
    app.getPath('userData'), // Electron 获取应用数据目录
    'logs', // 日志文件夹名称
    `app-${format(new Date(), 'yyyy-MM-dd')}.log` // 日志文件名（包含当前日期，如 app-2023-10-01.log）
  );

  // 当日志文件达到最大尺寸时，自动对日志进行归档和清理
  // 检查当前日志文件是否存在，不存在则跳过
  // 查找同目录下所有同前缀的日志文件（如 app-2023-10-01.log、app-2023-10-01.1.log 等）
  // 对日志文件按序号排序（0 是最新，1 是前一天，以此类推）
  // 循环处理文件：
  // 序号 +1（如 app-xxx.log → app-xxx.1.log，app-xxx.1.log → app-xxx.2.log）
  // 超过 fileLimit（5 个）的旧文件直接删除
  const archiveLog = (filePath: any) => {
    try {
      const filePathStr = filePath.toString();
      if (!fs.existsSync(filePathStr)) {
        console.warn(`log file doesn't exists, skip the rotate: ${filePath}`);
        return;
      }

      const info = path.parse(filePathStr);
      const baseName = info.name;
      const ext = info.ext;
      const dir = info.dir;

      const allFiles = fs
        .readdirSync(dir)
        .filter(file => {
          return file.startsWith(baseName) && file.endsWith(ext);
        })
        .map(file => path.join(dir, file));

      const getFileIndex = (file: string) => {
        const name = path.parse(file).name;
        const match = name.match(/\.(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      };

      allFiles.sort((a, b) => getFileIndex(a) - getFileIndex(b));

      for (let i = allFiles.length - 1; i >= 0; i--) {
        const currentFile = allFiles[i];
        const currentIndex = getFileIndex(currentFile);
        const newIndex = currentIndex + 1;

        if (newIndex > fileLimit) {
          fs.unlinkSync(currentFile);
          continue;
        }

        const newFileName = `${baseName}.${newIndex}${ext}`;
        const newFilePath = path.join(dir, newFileName);

        if (fs.existsSync(newFilePath)) {
          fs.unlinkSync(newFilePath);
        }
        fs.renameSync(currentFile, newFilePath);
      }
    } catch (e) {
      console.error('log rotate failed:', e);
    }
  };
  log.transports.file.archiveLogFn = archiveLog; // 绑定日志轮转函数
  log.transports.file.resolvePathFn = () => logPath; // 自定义日志文件路径
  log.transports.file.maxSize = 1024 * 1024 * 10; // 单个日志文件最大尺寸（10MB）

  log.transports.file.format =
    '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'; // 日志格式

  isInitialized = true;
  return log;
}

export default initLogger();

```

## 参考链接

- [electron-log](https://www.npmjs.com/package/electron-log)
- [archiveLogFn](https://github.com/megahertz/electron-log/blob/46a6de343c8b691714025a994420d6d3aeafa1f7/docs/transports/file.md#archivelogfn-oldlogfile-logfile--void)