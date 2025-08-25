# 集成 sqlite 数据库

- 桌面应用很多情况都要用到数据库来管理数据，这里使用嵌入式数据库 `sqlite`


| 核心优点           | 详细说明                                                                                                                                                               |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 轻量级，零配置      | 1. 嵌入式数据库，无需独立安装服务器进程，仅需一个动态库（.dll/.so）即可运行，随软件打包分发；<br>2. 数据库以单一文件（.db/.sqlite）存在，便于管理、备份和迁移（直接复制文件即可）。 |
| 跨平台兼容性       | 支持 Windows、macOS、Linux 等主流桌面系统，数据库文件格式在不同平台间通用，无跨系统数据兼容问题。                                                                           |
| 低资源占用         | 内存和 CPU 消耗极低，适合硬件配置有限的设备（如老旧电脑、嵌入式设备），不影响桌面软件运行性能。                                                                              |
| ACID 事务支持      | 具备完整的事务特性（原子性、一致性、隔离性、持久性），避免意外断电或崩溃导致的数据损坏，保障数据操作安全。                                                                     |
| 无需网络依赖       | 数据存储在本地，读写无需网络，适合离线使用场景，且本地访问速度远快于远程数据库。                                                                                           |
| 开源免费           | 遵循 Public Domain 协议，可免费用于商业软件，无需支付授权费用，显著降低开发成本。                                                                                          |
| 丰富的编程语言支持 | 兼容几乎所有主流编程语言（C/C++、Python、Java、C#、Node.js 等），均有成熟驱动，集成难度低。                                                                                     |

- ndoejs 的 [sqlite3](https://www.npmjs.com/package/sqlite3) 这个包已经渐渐不维护了，所以这里选用 [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) 这个包

## 安装和编译

- 首先安装 `better-sqlite3`
  ```bash
    npm i better-sqlite3
  ```

- 这里需要注意 `better-sqlite3` 是 `C/C++` 编写的原生 `Node` 模块，而 `Electron` 虽基于 `Node.js`，但使用独立的 `V8` 引擎和 `Node.js` 二进制接口（ABI），与系统 `Node` 环境不兼容，直接安装的 `better-sqlite3` 是针对系统 `Node` 编译的，无法在 `Electron` 中运行，会发生下面的错误信息：
  ```bash
    [2025-08-25 11:41:44.059] [error] {
    errorSummary: 'db initialize failed',
    message: "The module '\\\\?\\D:\\project\\work\\electron-build-update-demo\\node_modules\\sqlite\\build\\Release\\better_sqlite3.node'\n" +
      'was compiled against a different Node.js version using\n' +
      'NODE_MODULE_VERSION 127. This version of Node.js requires\n' +
      'NODE_MODULE_VERSION 136. Please try re-compiling or re-installing\n' +
      'the module (for instance, using `npm rebuild` or `npm install`).',
    code: 'ERR_DLOPEN_FAILED',
    stack: "Error: The module '\\\\?\\D:\\project\\work\\electron-build-update-demo\\node_modules\\sqlite\\build\\Release\\better_sqlite3.node'\n" +
      'was compiled against a different Node.js version using\n' +
      'NODE_MODULE_VERSION 127. This version of Node.js requires\n' +
      'NODE_MODULE_VERSION 136. Please try re-compiling or re-installing\n' +
      'the module (for instance, using `npm rebuild` or `npm install`).\n' +
      '    at process.func [as dlopen] (node:electron/js2c/node_init:2:2617)\n' +
      '    at Module._extensions..node (node:internal/modules/cjs/loader:1930:18)\n' +
      '    at Object.func [as .node] (node:electron/js2c/node_init:2:2617)\n' +
      '    at Module.load (node:internal/modules/cjs/loader:1472:32)\n' +
      '    at Module._load (node:internal/modules/cjs/loader:1289:12)\n' +
      '    at c._load (node:electron/js2c/node_init:2:18013)\n' +
      '    at TracingChannel.traceSync (node:diagnostics_channel:322:14)\n' +
      '    at wrapModuleLoad (node:internal/modules/cjs/loader:242:24)\n' +
      '    at Module.require (node:internal/modules/cjs/loader:1494:12)\n' +
      '    at require (node:internal/modules/helpers:135:16)'
  ```
  所以需要在 `package.json` 中加入 `"rebuild": "electron-rebuild -f -w better-sqlite3"` 这条命令，用 [@electron/rebuild](https://www.npmjs.com/package/@electron/rebuild) 工具，针对当前 `Electron` 版本重新编译 `better-sqlite3`，使其适配 `Electron` 运行时；其中 `-f` 强制重建，`-w better-sqlite3` 指定仅编译该模块，最终解决原生模块的兼容性问题

## DB 类和 orm 工具类

- 本来想去集成类似 [typrorm](https://www.npmjs.com/package/typeorm) 的 orm 工具库，但是最后决定自己实现 orm 类，因为像 `typeorm` 这样的库，兼容基本上所有常用数据库，并且它很难通过打包工具整体编译输出到最终一个 js 文件中，因为模块系统不兼容的问题，这样体积庞大的包会导致 asar 包变得非常大，之前测试包含了 `typeorm` 的 asar 包体积增到到了 27mb，因此放弃集成第三方的 orm，转而自己实现

- 首先先封装 DB 数据库类
  