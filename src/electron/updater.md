# electron全量更新与增量更新

* electron 的自动更新功能依赖于 `electron-builder` 和 `electron-updater`
* `electron-builder` 打包以后会生成 3 个文件
  - `latest.yml` 包含最新版本包的信息的配置文件，其中有 文件版本号，文件地址，文件哈希值，打包时间
  - `electron-update Setup 1.0.0.exe` 安装包exe文件
  - `electron-update Setup 1.0.1.exe.blockmap` blockmap 文件，它记录了应用程序文件的区块索引和哈希值，帮助 electron-updater 精准识别新旧版本间的差异


## 如何实现

1. 打包后将 `latest.yml`，`安装包exe文件`还有 `blockmap 文件`全部放到服务器上作为静态资源文件服务，需要配置静态资源服务，以便后续检查更新的时候客户端 app 可以下载到这些文件
  ```js
  const Koa = require('koa');
  const app = new Koa();
  const serve = require('koa-static-server');
  const { rangeStatic } = require('koa-range-static');

  // app.use(
  //   serve({
  //     rootDir: 'public',
  //     rootPath: '/',
  //     setHeaders: (res, path, stat) => {
  //       res.setHeader('Accept-Ranges', 'bytes');
  //       res.setHeader('Content-Type', 'multipart/byteranges');
  //     },
  //   })
  // );

  app.use(rangeStatic({ root: 'public', directory: true }));
  app.listen(33855);
  ```
2. 在主进程中引入 `electron-updater` 的逻辑
  ```js
  const { app, BrowserWindow, ipcMain } = require('electron');
  const path = require('node:path');
  const { autoUpdater } = require('electron-updater');
  const log = require('electron-log');

  // 为 autoUpdater 设置日志工具，autoUpdater 内部的日志都会输出到硬盘中，windows 系统默认在 C:\Users\用户名\AppData\Roaming\应用名\logs 下，方便 debug
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';

  // 设置 disableDifferentialDownload 可以关闭差分更新，也就是增量更新
  // autoUpdater.disableDifferentialDownload = true;
  log.info('App starting...');

  let win;

  const createWindow = () => {
    win = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    win.loadFile('index.html');
    win.webContents.openDevTools();

    win.on('ready-to-show', () => {
      log.info('start check updates');
      // 检查是否需要更新
      autoUpdater.checkForUpdatesAndNotify();
    })
  };

  function sendStatusToWindow(text) {
    log.info(text);
    win.webContents.send('message', text);
  }

  // 检查更新事件
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Checking for update...');
  });

  // 有新版本可用
  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('Update available.');
  });

  // 无可用更新
  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('Update not available.');
  });

  // 报错
  autoUpdater.on('error', (err) => {
    sendStatusToWindow('Error in auto-updater. ' + err);
  });

  // 下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message =
      log_message +
      ' (' +
      progressObj.transferred +
      '/' +
      progressObj.total +
      ')';
    sendStatusToWindow(log_message);
  });

  // 更新包下载完成
  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('Update downloaded');
  });

  app.whenReady().then(() => {
    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  ```
3. 在 `package.json`中配置打包选项
```js
  {
    "build": {
    "appId": "update.test",
    "publish": [// generic 是自定义的更新服务器，也就是我们上面用 koa 实现的静态文件服务, url 是服务的域名
      {
        "provider": "generic",
        "url": "http://127.0.0.1:33855/"
      }
    ],
    "win": { // windows 目标格式为 nsis 安装包
      "target": "nsis"
    },
    "nsis": { // nsis 安装包配置项
      "createDesktopShortcut": "always"
    },
    "electronDownload": { // electron-builder 打包编译时切换镜像源，避免下载超时失败问题
    // https://github.com/electron/get?tab=readme-ov-file#specifying-a-mirror
      "mirror": "https://registry.npmmirror.com/binary.html?path=electron/"
    }
  }
  }
```
4. 这样当应用安装后启动，主进程就会触发 `autoUpdater.checkForUpdatesAndNotify()`去检查是否需要更新，如果当前电脑安装的是 `1.0.0`版本，而静态资源服务上的 `latest.yml` 中是 `1.0.1` 版本号，`electron-updater`就会判断应用需要更新。这里会发生下面几件事：
  1. 第一个版本，`1.0.0`版本安装成功后，`1.0.0`的安装包文件会被复制到 `C:\Users\用户名\AppData\Local\应用名-updater` 目录下
  2. `autoUpdater.checkForUpdatesAndNotify()` 会请求文件服务器上的 `latest.yml` 文件，然后做版本号比较，判断是否需要更新
  3. 如果 `latest.yml` 中是 `1.0.1`则需要更新，`autoUpdater`会去下载`1.0.0`和`1.0.1`两个版本的 `blockmap` 文件，两个版本的 `blockmap` 文件只要有一个不存在，就无法比较差异，自动降级为全量更新，直接下载完整的 `1.0.1` 安装包；如果两个版本的 `blockmap` 文件都存在，就下载然后比对新旧版本之间区块的差异，然后差分更新，只去下载需要更新的部分。新版本的安装包文件会下载到 `C:\Users\用户名\AppData\Local\应用名-updater\pending`目录下
  4. 待用户退出应用后会自动发起静默更新操作，在系统后台自动安装新版本应用

## 日志表现

- 全量更新的时候日志是这样的：
  ```log
    [2025-07-31 11:46:33.448] [info]  App starting...
    [2025-07-31 11:46:34.234] [info]  start check updates
    [2025-07-31 11:46:34.235] [info]  Checking for update
    [2025-07-31 11:46:34.236] [info]  Checking for update...
    [2025-07-31 11:46:34.265] [info]  Found version 1.0.1 (url: electron-update Setup 1.0.1.exe)
    [2025-07-31 11:46:34.265] [info]  Update available.
    [2025-07-31 11:46:34.266] [info]  Downloading update from electron-update Setup 1.0.1.exe
    [2025-07-31 11:46:34.284] [warn]  disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version.
    [2025-07-31 11:46:35.260] [info]  Download speed: 92694231 - Downloaded 100% (87966825/87966825)
    [2025-07-31 11:46:35.265] [info]  New version 1.0.1 has been downloaded to C:\Users\用户名\AppData\Local\electron-update-updater\pending\electron-update Setup 1.0.1.exe
  ```
- 增量更新的时候日志是这样的：
  ```log
    [2025-07-31 13:48:53.127] [info]  App starting...
    [2025-07-31 13:48:53.587] [info]  start check updates
    [2025-07-31 13:48:53.588] [info]  Checking for update
    [2025-07-31 13:48:53.589] [info]  Checking for update...
    [2025-07-31 13:48:53.645] [info]  Found version 1.0.1 (url: electron-update Setup 1.0.1.exe)
    [2025-07-31 13:48:53.645] [info]  Update available.
    [2025-07-31 13:48:53.646] [info]  Downloading update from electron-update Setup 1.0.1.exe
    [2025-07-31 13:48:53.649] [warn]  disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version.
    [2025-07-31 13:48:53.650] [info]  Download block maps (old: "http://127.0.0.1:33855/electron-update%20Setup%201.0.0.exe.blockmap", new: http://127.0.0.1:33855/electron-update%20Setup%201.0.1.exe.blockmap)
    [2025-07-31 13:48:53.792] [info]  File has 85 changed blocks
    [2025-07-31 13:48:53.812] [info]  Full: 349,896.58 KB, To download: 1,950.42 KB (1%)
    [2025-07-31 13:48:56.232] [info]  New version 1.0.1 has been downloaded to C:\Users\用户名\AppData\Local\electron-update-updater\pending\electron-update Setup 1.0.1.exe
  ```
- 对比可以看到增量更新只下载了原始安装包大小的 1%


## `electron-updater`其他参数

```js
autoUpdater.forceDevUpdateConfig = true //开发环境下强制更新
autoUpdater.autoDownload = false; // 自动下载更新
autoUpdater.autoInstallOnAppQuit = true; // 应用退出后自动安装
autoUpdater.quitAndInstall(isSilent, isForceRunAfter); // 退出应用并安装已经下载好的更新。isSilent 是否静默安装 isForceRunAfter 安装后是否重启应用
```

## 注意事项

- 静态文件服务器需要支持范围请求（即请求资源的一部分而非全部），即 `Accept-Ranges` 响应头，所以上面代码中使用了 `koa-range-static` 而不是 `koa-static-server`，如果不支持，`electron-updater`记录的日志会报错，并且更新行为会自动降级为全量更新
  ```log
    [2025-07-31 03:59:35.855] [error] Cannot download differentially, fallback to full download: Error: Server doesn't support Accept-Ranges (response code 200)
    [2025-07-31 04:42:03.324] [error] Cannot download differentially, fallback to full download: Error: Content-Type "multipart/byteranges" is expected, but got "application/x-msdos-program"
  ```
- 如果某个新版本不想走增量更新，直接将服务器上对应的 `blockmap` 文件删除即可

## 参考链接

- [auto-update](https://www.electron.build/auto-update)
- [electron-updater-example](https://github.com/iffy/electron-updater-example)
- [Can I disable differential download? #4682](https://github.com/electron-userland/electron-builder/issues/4682)