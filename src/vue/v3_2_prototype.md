# 源码结构

## 结构

```
vue-3.2.37
├─.github
├─.vscode
├─packages // 核心代码
│  ├─compiler-core // 编译器核心代码
│  ├─compiler-dom // 浏览器相关的编译模块
│  ├─compiler-sfc // 单文件组件（.vue）编译模块
│  ├─compiler-ssr // 服务端渲染的编译模块
│  ├─reactivity // 响应式核心模块
│  ├─reactivity-transform // 已过期代码，无需关注
│  ├─runtime-core // 运行时核心代码，针对不同平台进行实现
│  ├─runtime-dom // 基于浏览器的运行时
│  ├─runtime-test // runtime 测试相关
│  ├─server-renderer // 服务端渲染
│  ├─sfc-playground // sfc 工具 https://sfc.vuejs.org
│  ├─shared // 共享的工具类
│  ├─size-check // 测试运行时包大小
│  ├─template-explorer // 提供了一个线上测试 https://template-explorer.vuejs.org 用于把 template 转化为 render
│  ├─vue // 测试，打包之后的 dist 都在这里
│  └─vue-compat // 兼容 vue2 的代码
├─scripts // 配置文件相关
└─test-dts // 测试相关
│  .eslintrc.js
│  .gitignore
│  .prettierrc
│  api-extractor.json // Typescript 的 API 分析工具
│  BACKERS.md // 赞助声明
│  CHANGELOG.md // 更新日志
│  jest.config.js // 测试相关
│  LICENSE // 开源协议
│  netlify.toml // 自动化部署相关
│  package.json
│  pnpm-lock.yaml
│  pnpm-workspace.yaml
│  README.md
│  rollup.config.js // rollup 配置文件
│  SECURITY.md // 报告漏洞，维护安全的声明文件
│  tsconfig.json // TypeScript 配置文件
```

## 在 vue 源码中运行测试实例

- 切换 nodejs 到 18, vue-3.2.37 需要 nodejs 18 环境。全局安装 pnpm ，然后 pnpm 装包，装包成功后运行 npm run build
- `packages\vue\dist` 目录下就是生成的 vue 库文件
- `packages\vue\examples` 目录下新建文件夹 xia，写自己的测试实例
- 然后使用 vscode 的 live server 插件打开测试页面，即可看到效果

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <script src="../../../dist/vue.global.js"></script>
  </head>

  <body>
    <div id="app"></div>
  </body>

  <script>
    const { reactive, effect } = Vue;

    const obj = reactive({ name: "张三" });

    effect(() => {
      document.querySelector("#app").innerHTML = obj.name;
    });

    setTimeout(() => {
      obj.name = "李四";
    }, 2000);
  </script>
</html>
```

## debug：为 vue 开启 sourcemap

- 通过 `scripts\build.js` 文件得知，sourcemap 的开启是由 npm script 命令中的 -sourcemap 或者 -s 参数开启的，于是修改一下 build 的命令就可以开启 sourcemap 了

```js
"build": "node scripts/build.js -s",
```

- 然后在浏览器的 Sources 面板中就可以打断点 debugger 了

## 如何阅读源码

1. 摒弃边缘情况，仅阅读核心逻辑
2. 跟随一条主线

## 创建自己的 vue-next-mini 搭建框架

- 创建 vue-next-mini 文件夹，npm init 初始化，创建对应 packages 文件夹
- 全局安装 typescript，初始化 tsconfig.json 文件，并为 packages 目录下所有模块都创建 src/index.ts 文件
  ```js
    // 全局安装 typescript
    npm install -g typescript
    // 初始化 tsconfig.json 文件
    tsc -init
  ```
- 引入 prettier 保证代码格式
  - vscode 插件市场安装 `Prettier - Code formatter` 插件
  - 根目录下创建 `.prettierrc` 配置文件
    ```js
      {
        "semi": true,
        "singleQuote": true,
        "printWidth": 80,
        "trailingComma": "all",
        "arrowParens": "avoid"
      }
    ```
- 新建 rollup.config.js 文件

  ```js
  import commonjs from "@rollup/plugin-commonjs";
  import resolve from "@rollup/plugin-node-resolve";
  import typescript from "@rollup/plugin-typescript";

  export default [
    {
      input: "packages/vue/src/index.ts", // 入口文件
      output: [
        {
          sourcemap: true, // 开启 sourcemap
          file: "./packages/vue/dist/vue.js", // 导出文件地址
          format: "iife", // 出口文件 导出一个 iife 格式的包
          name: "Vue", // 变量名
        },
      ],
      plugins: [
        typescript({
          // ts
          sourceMap: true,
        }),
        resolve(), // 模块导入路径补全
        commonjs(), // 转换 commonjs 为 esm
      ],
    },
  ];
  ```

- 在 tsconfig.js 中配置路径映射
  ```js
    {
      "baseUrl": ".",
      "paths": { // 指定路径映射
        "@vue/*": [
          "packages/*/src"
        ]
      },
    }
  ```
