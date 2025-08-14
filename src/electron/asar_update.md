# asar 增量更新

通过观察发现 `electron-builder` 和 `electron-updater` 实现的差分更新，并不能节省多少下载的带宽，这时候就需要实现只更新 `asar` 包的增量更新，1 包的体积小，更能节省带宽，提升更新的速度，用户体验好。

## 两种方案

- 不管是哪种方案，`asar` 更新的本质都是
  1. 下载新版本的 `asar` 包
  2. 关闭软件之后用新版本包覆盖旧版本包
  3. 重启软件更新完成
- 所以两种方案的区别就在于关闭软件之后覆盖文件的方式不同，因为软件正在运行的途中，`asar` 包处于锁定状态，是无法覆盖的，所以就是为了解决覆盖文件的问题
  1. 第一种是双 `asar` 包方案，软件会生成两个 `asar` 包，`electron-builder` 默认打包生成的 `app.asar` 作为入口包，软件启动后还是从 `app.asar` 启动，但是 `app.asar` 的代码里只存放检测新版本文件和覆盖的逻辑，做完覆盖操作后就使用 `require` 或者 `import` 动态导入 `main-v1.0.0.asar` 这个主 `asar` 包，所有软件的业务逻辑都在主包中
  2. 第二种逻辑简单一些，检查升级服务器是否存在新版本包，如果存在就下载下来，下载成功后立即退出软件，同时启动一个子进程，与软件主进程脱离关系，主进程退出后执行一个批处理脚本（或者 shell 脚本）覆盖操作，覆盖成功后再重启软件。所有的覆盖逻辑还有重启逻辑都在批处理脚本中
- 优缺点分析：
  - 双 `asar` 方案缺点是会出现两个版本号，因为 `asar` 包中必须存在 `package.json` 文件，因此当主包升级后，主包版本号会和入口包版本号不一致，解决办法是实现一个方法，需要读取版本号的时候都要去读取主包内的 `package.json` 的版本号。双包方案实现起来略微有些复杂
  - 批处理脚本的优点是，实现起来简单，缺点是有可能批处理脚本的操作会被杀毒软件认为是病毒操作，被误杀

## 双 asar 方案

```js
// 主包入口文件 index.js
const path = require('node:path');
const { app, dialog } = require('electron');
const log = require('./logger');
const fs = require('node:fs');
const { getMajorPackageInfo, findAsarFilesInResources } = require('./utils.js');

try {
  // 如果是生产包，就去扫描软件安装目录 resources 目录下是否存在多个 asar 包，如果存在说明新版本已经下载到本地了，判断哪个 asar 包是最新版本，然后进行文件替换操作完成升级
  // 新版本包下载下来是带 .tmp 后缀的 main-v1.0.0.asar.tmp 以便和旧版本区分
  if (app.isPackaged) {
    const asarFiles = findAsarFilesInResources();
    log.info(asarFiles, 'asarFiles');
    if (asarFiles.length > 1) {
      const tmp = asarFiles.filter(i => i.includes('.tmp'))[0];
      const old = asarFiles.filter(i => !i.includes('.tmp'))[0];
      log.info(`tmp: ${tmp} old: ${old}`);
      if (tmp && old) {
        try {
          fs.renameSync(tmp, tmp.replace('.tmp', ''));
          fs.unlinkSync(old);
          log.info('update main asar successful');
        } catch (err) {
          log.error(`fs.renameSync err: ${err}`);
        }
      }
    }
  }

  let mainAppPath;
  // 本地 dev 开发环境直接加载 main.js 主逻辑文件
  if (!app.isPackaged) {
    mainAppPath = path.join(app.getAppPath(), 'main', 'main.js');
  } else {
    // 生产环境动态加载主 asar 包中的 main.js
    const asarFiles = findAsarFilesInResources();
    const mainAsar = asarFiles[0];
    const pkg = getMajorPackageInfo(mainAsar);
    log.info(pkg, 'pkg');
    const resourcesPath = path.dirname(app.getAppPath());
    mainAppPath = path.join(
      resourcesPath,
      `${pkg.name}-${pkg.version}.asar`,
      'main.js'
    );
  }

  log.info('Loading main application from:', mainAppPath);
  // 动态加载
  const mainModule = require(mainAppPath);
  mainModule(log);
} catch (error) {
  log.error('Failed to load main application:', error);

  dialog.showErrorBox(
    '应用加载失败',
    `无法加载主应用模块: ${error.message}\n请尝试重新安装应用`
  );

  app.quit();
}

// 获取主包版本号
exports.getMajorPackageInfo = function getMajorPackageInfo(mainAsarPath) {
  try {
    let pkgPath;

    if (!app.isPackaged) {
      pkgPath = path.join(__dirname, './package.json');
    } else {
      pkgPath = path.join(mainAsarPath, 'package.json');
    }

    const pkgContent = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(pkgContent);
  } catch (error) {
    log.error('read package.json failed:', error);
    return {
      name: 'unknown-app',
      version: '0.0.0',
    };
  }
};

// 获取 resources 目录下多个 asar 主包
exports.findAsarFilesInResources = function findAsarFilesInResources() {
  try {
    const resourcesPath = path.dirname(app.getAppPath());
    log.log('resources dir path:', resourcesPath);

    const files = fs.readdirSync(resourcesPath, { withFileTypes: true });

    const asarFiles = files
      .filter(
        item =>
          !item.isDirectory() &&
          item.name.includes('asar') &&
          item.name !== 'app.asar'
      )
      .map(item => path.join(resourcesPath, item.name));

    log.log(`find ${asarFiles.length} files includes asar:`);
    asarFiles.forEach(file => log.log(`- ${file}`));

    return asarFiles;
  } catch (error) {
    log.error('get asar files list failed:', error.message);
    return [];
  }
};
```

下面是主包逻辑 main.js

```js

```

## 批处理方案
