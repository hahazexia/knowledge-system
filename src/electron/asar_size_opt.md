# 优化 asar 包大小

因为整个安装包太大，一般都在 100mb 以上，因此实现了 asar 包增量更新，所以就需要优化 asar 包的大小，如果 asar 包体积过大，那么 asar 增量更新就失去了意义

- 减小 asar 的包体积主要有这么几个手段：

  - 通过 `package.json` 中的 `build.files` 字段设置最终要打包到 asar 中的文件，从中剔除不需要的文件
  - 打包生产环境安装包时将主进程代码打包，并配置打包工具将 `node_modules` 中使用到的模块也打入最终 js 文件中，这样 asar 中的 node_modules 体积就会大大减少
  - `package.json` 中的生产环境依赖只留下最终需要引入的模块，其他模块都放入 dev 依赖中，dev 依赖不会存在于 asar 中

- `build.files` 设置打包的文件，不需要的文件前面用感叹号

```json
{
  "files": [
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
  ]
}
```

- 配置 vite.es.config.js 将主进程代码使用到的 node_modules 依赖打入最终 js 文件
  - 除了原生模块（electron better-sqlite3）以外， 'electron-log', 'dotenv', 'electron-updater', 'iconv-lite', 这几个包都是 commonjs 模块，并且他们没有默认导出，如果尝试将他们打入最终包，vite 就会报错，所以这几个模块都作为外部模块提供，并且放在 pakakage.json 中的生产依赖中，最后会存在于 asar 的 node_modules 中

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

- 生产依赖只留下需要的，其他都移入开发依赖

```json
{
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "dotenv": "^17.2.1",
    "electron-log": "^5.4.2",
    "electron-updater": "^6.6.2",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "@electron/asar": "^4.0.0",
    "@rollup/plugin-commonjs": "^28.0.6",
    "@rollup/plugin-node-resolve": "^16.0.1",
    "@types/better-sqlite3": "^7.6.13",
    "@types/electron": "^1.4.38",
    "@types/node": "^24.2.0",
    "axios": "^1.11.0",
    "concurrently": "^9.2.0",
    "copyfiles": "^2.4.1",
    "date-fns": "^4.1.0",
    "electron": "^37.2.4",
    "electron-builder": "^26.0.12",
    "fs-extra": "^11.3.1",
    "globby": "^14.1.0",
    "koa": "^3.0.1",
    "koa-range-static": "^1.3.0",
    "koa-router": "^13.1.1",
    "koa-static-server": "^1.5.2",
    "nodemon": "^3.1.10",
    "rimraf": "^6.0.1",
    "typescript": "^5.9.2",
    "vite": "^7.0.6",
    "vite-plugin-electron": "^0.29.0",
    "vite-plugin-static-copy": "^3.1.1"
  }
}
```

这样优化后， asar 包的体积只有 2 ~ 3 mb，体积很小了

## 参考链接

- [electron-builder configuration files](https://www.electron.build/configuration#files)
