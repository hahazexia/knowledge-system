# 打包流程

- 对应开发环境的搭建，打包的流程也一样，先编译主进程文件，然后再编译页面文件，将这两部分都输出到同一个 dist 目录，然后再启动 `electron-builder` 打包

```js
{
    "scripts": {
    "clean": "rimraf ./dist",
    "build:es": "vite build --config vite.es.config.js", // 编译主进程
    "build:cjs": "vite build --config vite.cjs.config.js", // 编译 preload.js
    "build:vite": "npm run clean && npm run build:es && npm run build:cjs",
    "build:electron": "electron-builder build", // electron-builder 打包
    "build": "npm run build:vite && electron-builder build",
  },
}
// demo 这里没有使用前端框架作为渲染进程页面的开发，如果使用了前端框架，那就在 build 命令中 electron-builder 打包之前再加上一条编译前端页面的命令即可
```

![electron_build](./img/electron_build.png)

- 下面是 vite.es.config.js 编译主进程的 vite 配置

```js
import { defineConfig, normalizePath } from 'vite';
import path from 'path';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// 主进程中用到的 node 原生模块
const nodeBuiltins = [
  'node:http',
  'node:https',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:url',
  'node:child_process',
  'module',
];

export default defineConfig({
  root: path.resolve(__dirname, 'src/main'), // 项目根目录，主进程 js 所在目录
  plugins: [
    // 使用插件将渲染进程 html 相关文件复制到 dist 目录中
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(path.resolve(__dirname, 'src/renderer/*')),
          dest: './',
        },
      ],
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'), // 输出路径
    emptyOutDir: false, // vite 编译前是否先清空输出目录下所有文件，这里选择 false 以防和复制 html 文件的行为互相冲突
    target: 'node22', // 最终编译结果兼容什么环境
    lib: {
      // 以库的形式构建
      entry: ['index.ts'], // 入口 js 文件
      formats: ['es'], // 使用 esm 模块
      fileName: (format, entryName) => {
        // 输出的最终文件名
        return `${entryName}.js`;
      },
    },
    rollupOptions: {
      external: [
        // 排除在 bundle 外部的模块，这些模块是原生模块或者不想被打包到最终js文件中的模块
        ...nodeBuiltins,
        'electron',
        'electron-log',
        'dotenv',
        'electron-updater',
        'iconv-lite',
        'better-sqlite3',
      ],
      plugins: [
        /**
         * @rollup/plugin-node-resolve 插件的主要职责是帮助 Rollup 解析和处理 Node.js 风格的模块导入语句。在 Node.js 环境中，模块可以通过相对路径、绝对路径、npm 包名（如 import something from 'my-package'）等多种方式进行导入。然而，Rollup 默认仅支持 ES 模块导入（即通过相对或绝对路径导入本地文件）。使用 @rollup/plugin-node-resolve 插件后，Rollup 能够识别并正确处理 Node.js 的模块导入机制，包括解析 node_modules 目录下的依赖包以及处理 package.json 中的 main、module、browser 等字段。
         */
        nodeResolve({
          preferBuiltins: true, // 优先解析为 node 原生模块
          browser: false, // 不使用浏览器模块的解决方案
        }),
        // @rollup/plugin-commonjs 用于将 node_modules 中的 commonjs 包转换成 esm 模块，这样就能够被打包到最终 js 文件中
        commonjs({
          include: /node_modules/, // 告诉插件处理 node_modules 中的模块
          esmExternals: true, // 假设所有模块都是 esm 模块
        }),
      ],
      output: {
        entryFileNames: 'index.js', // 入口文件
        format: 'es', // 打包成 esm 模块
        externalLiveBindings: true, // 为外部依赖生成动态绑定的代码
        globals: {
          // 为外部依赖指定全局变量名
          electron: 'electron',
        },
        sourcemap: true, // 开启 sourcemap
        sourcemapExcludeSources: true, // 如果为 true 实际源代码将不会被添加到 sourcemap 文件中
      },
    },
  },
});
```

- 下面是 vite.cjs.config.js 编译 preload.js

```js
import { defineConfig, normalizePath } from 'vite';
import path from 'path';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default defineConfig({
  root: path.resolve(__dirname, 'src/main'), // 项目根目录，preload.js 所在目录
  build: {
    outDir: path.resolve(__dirname, 'dist'), // 输出路径
    emptyOutDir: false, // vite 编译前是否先清空输出目录下所有文件
    target: 'node22', // 最终编译结果兼容什么环境
    lib: {
      entry: ['preload.ts'], // 入口文件
      formats: ['cjs'], // 输出为 commonjs 模块
      fileName: (format, entryName) => {
        // 输出文件名
        return `${entryName}.js`;
      },
    },
    rollupOptions: {
      external: ['electron'], // 排除在 bundle 外部的模块
      plugins: [
        // 解析 nodejs 风格的模块导入
        nodeResolve({
          preferBuiltins: true,
          browser: false,
        }),
      ],
      output: {
        entryFileNames: 'preload.js', // 入口文件
        format: 'cjs', // 输出为 commonjs 模块
      },
    },
  },
});
```

下面是关键，`package.json` 中的 `electron-builder` 配置

```js
{
  "build": {
    "appId": "update.test", // 应用id
    "productName": "hahazexia", // 产品名
    "directories": {
      "output": "out" // 打包输出目录
    },
    "publish": [ // 为自动更新设置下载服务器地址
      {
        "provider": "generic", // 自定义服务
        "url": "http://127.0.0.1:33855/" // 升级接口地址
      }
    ],
    "win": { // 打包目标平台和安装包格式
      "target": "nsis"
    },
    "nsis": { // nsis 配置
      "oneClick": false, // 是否生成一键安装包
      "perMachine": true, // 是否为每个用户安装应用（显示安装模式页面）
      "warningsAsErrors": false, // nsis 允许 warning 存在
      "createDesktopShortcut": "always", // 创建桌面图标
      "allowToChangeInstallationDirectory": true, // 允许用户修改安装路径
      "artifactName": "${productName}_v${version}.exe", // 安装包文件名
      "license": "./mxy_SoftwareLicence.txt", // 安装包协议页显示内容
      "installerIcon": "./icon.ico", // 安装包图标
      "uninstallerIcon": "./icon.ico", // 卸载图标
    },
    "electronDownload": { // 打包过程中下载 electron 的镜像地址
      "mirror": "https://registry.npmmirror.com/binary.html?path=electron/"
    },
    "files": [ // 打包的文件列表
      "**/*",
      ".env",
      "package.json",
      "!nsis_publish/**/*",
      "!out/**/*",
      "!public",
      "!src",
      "!.gitignore",
      "!afterAllArtifactBuild.cjs",
      "!afterPack.cjs",
      "!beforePack.cjs",
      "!*.ico",
      "!installer.nsi",
      "!License.txt",
      "!out.log",
      "!package-lock.json",
      "!README.md",
      "!Readme.txt",
      "!server.js",
      "!sha512.js",
      "!tsconfig.*.json",
      "!tsconfig.json",
      "!update.json",
      "!vite.*.config.ts",
      "!*.exe"
    ],
    "afterPack": "./afterPack.cjs" // 钩子函数文件
  }
}
```

## 输出目录

最终打包输出的结果如下：

```bash
electron-build-update-demo\out
└─win-unpacked // 未压缩的完整的应用文件夹
  ├─locales // electron 核心模块的国际化文件
  ├─resources // 应用的核心资源目录
  │ ├─app.asar.unpacked //app.asar 的 “未打包” 目录。
  │ ├─app-update.yml // Electron 自动更新的配置文件
  │ ├─app.asar // 核心源码
  │ ├─elevate.exe // （仅 Windows 平台）这是一个用于提升应用权限的辅助程序
  ├─chrome_100_percent.pak
  ├─chrome_200_percent.pak
  ├─d3dcompiler_47.dll
  ├─electron-update.exe // 应用可执行文件
  ├─ffmpeg.dll
  ├─icudtl.dat
  ├─libEGL.dll
  ├─libGLESv2.dll
  ├─LICENSE.electron.txt
  ├─LICENSES.chromium.html
  ├─resources.pak
  ├─snapshot_blob.bin
  ├─v8_context_snapshot.bin
  ├─vk_swiftshader_icd.json
  ├─vk_swiftshader.dll
  ├─vulkan-1.dll
└─builder-debug.yml
└─builder-effective-config.yaml
└─electron-update Setup 0.0.16.exe // nsis 安装包文件
└─electron-update Setup 0.0.16.exe.blockmap // 安装包的块映射文件
└─latest.yml // 更新元数据配置文件，包含了应用最新版本的关键信息
```

其中重要的文件解释如下：

- `app.asar.unpacked` app.asar 的 “未打包” 目录。当你在 package.json 中通过 asarUnpack 配置指定某些文件不进行 ASAR 打包时（例如需要直接访问路径的二进制文件、动态链接库 .dll 等），这些文件会被解压到这个目录中。通常用于处理那些无法在 ASAR 归档中正常工作的资源
- `app-update.yml` 这是 Electron 自动更新（通过 electron-updater）的配置文件，包含了应用更新的元数据，如更新服务器地址、当前版本信息等。当应用检查更新时，会依据此文件的配置与远程服务器通信，判断是否有新版本
- `app.asar` 核心源码，应用源代码（HTML、CSS、JavaScript、图片等资源）被压缩打包成一个单一文件，既节省空间，又能防止源码轻易被篡改或查看。运行时，Electron 会直接从这个文件中读取并执行应用代码
- `elevate.exe`（仅 Windows 平台）这是一个用于提升应用权限的辅助程序。当你的应用需要以管理员权限运行某些操作（如修改系统设置、写入受保护目录）时，Electron 会调用 elevate.exe 来请求系统权限提升，确保操作能正常执行
- `electron-update Setup 0.0.16.exe.blockmap` 这是安装包的块映射文件，本质上是一个二进制差异文件。它记录了当前版本安装包（electron-update Setup 0.0.16.exe）与历史版本之间的差异信息。当应用检查更新时，Electron 的自动更新机制（通常基于 electron-updater）会利用这个文件，只下载新版本与旧版本之间的差异部分，而不是完整的安装包，从而减少更新时的下载流量，加快更新速度。
- `latest.yml` 这是更新元数据配置文件，包含了应用最新版本的关键信息，例如：

  - 最新版本号（version）
  - 安装包的下载地址（url）
  - 安装包的哈希值（sha512 等，用于校验文件完整性）
  - 发布时间
  - 当应用启动时，会通过 electron-updater 读取这个文件（通常是从远程服务器获取，本地也会保留一份），对比当前版本与最新版本，判断是否需要更新，并引导用户执行更新操作。

- `latest.yml` 负责告知 “最新版本是什么”，`blockmap` 负责优化 “如何高效下载更新”。

下面是 `latest.yml` 文件的内容示例

```yml
version: 0.0.16
files:
  - url: electron-update Setup 0.0.16.exe
    sha512: 746Vm4AoQaDDuUE+MC+ZmgX8neF10tmHn9+WoLF+UnZ+7ce5iYFR9HMnc9cXDaTk3JAaCIgTLXO5cM2G73fqrQ==
    size: 98884985
path: electron-update Setup 0.0.16.exe
sha512: 746Vm4AoQaDDuUE+MC+ZmgX8neF10tmHn9+WoLF+UnZ+7ce5iYFR9HMnc9cXDaTk3JAaCIgTLXO5cM2G73fqrQ==
releaseDate: '2025-08-17T15:52:11.794Z'
```

## 参考链接

- [vite config build](https://cn.vitejs.dev/config/build-options.html)
- [rollup config external](https://cn.rollupjs.org/configuration-options/#external)
- [import resolve from '@rollup/plugin-node-resolve' 这个包的作用是什么](https://www.cnblogs.com/longmo666/p/18107406)
