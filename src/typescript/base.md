# 搭建 ts 开发环境

- 首先在 node 环境中搭建开发环境 （node 环境方便演示）

```bash
npm i -g typescript
```

- 默认情况下， ts 会做出下面几种假设：

  - 假设当前执行环境是 dom
  - 如果代码中没有使用模块化语句（import export），便认为该代码是全局执行的
  - 编译目标代码是 es3 版本（保持最大兼容性）

- 有两种方式更改以上假设：
  - 使用 tsc 命令行时加上选项参数
  - 使用 ts 配置文件更改编译选项

## ts 配置文件

```bash
tsc --init
```

- 使用了配置文件后，使用 tsc 编译时，不能后写文件名（比如 tsc index.ts），这样会忽略配置文件
- node 环境需要安装 `@types/node`。@types 是 ts 官方的类型库，包含很多 js 代码的类型描述

## 使用第三方库简化流程

- ts-node 将 ts 代码在内存中编译并运行
- nodemon 监测文件变化

```bash
nodemon --exec ts-node src/index.ts
```
