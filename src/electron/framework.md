# 开发框架搭建

- 现在来搭建一个本地开发框架，要分两种情况
  - 第一种，主进程使用 esm 模块和 typescript，package.json 设置 `"type": "module"`，运行或者打包的时候还是将主进程代码编译成 esm 模块
  - 第二章，主进程依然使用 esm 模块，但是 package.json 设置 `"type": "commonjs"`，运行打包时编译成 commonjs 模块
- 这样分开的原因：
  - [electron v28.0.0](https://github.com/electron/electron/releases/tag/v28.0.0) 版本开始才全面支持 esm 模块，也就是之前的版本主进程代码都使用 commonjs 模块，而最后一个支持 windows7 系统的版本是 `electron v22`，如果还需要开发支持 win7 的应用，那就只能用 commonjs 模块来写主进程代码了。
  ```
    Electron will be ending support for Windows 7/8/8.1 after version 22.x.y following Chromium's plan to end support. Older versions of Electron will continue to work, but no further updates will be made for these operating systems.
  ```
  - 虽然官方说 v22 是最后一个支持 win7 的版本，但是看到有人测试发帖说 v22 在 win7 运行会报错，所以兼容 win7 需要使用 v21.4.4 版本，v21 的最后一个版本

## esm 模块

## 参考链接

- [feat: I guess it's esm #37535](https://github.com/electron/electron/pull/37535)
- [electron v28.0.0](https://github.com/electron/electron/releases/tag/v28.0.0)
- [electron v22.0.0](https://github.com/electron/electron/releases/tag/v22.0.0)
