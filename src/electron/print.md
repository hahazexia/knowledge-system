# 调用打印机打印小票

- 现在需要实现 electron 应用调用系统打印机然后打印小票的功能
  1. 首先在渲染进程获取到需要打印的小票数据，然后将数据配合页面组件渲染成 html 页面，新建一个 BrowserWindow 加载小票页面
  2. 监听 webContents 的 did-finish-load 事件，这时候小票页面内容已经加载好，发送 ipc 事件到主进程
  3. 主进程监听 ipc 事件，收到打印请求后，从数据库或者后台接口拉取默认打印机配置，如果默认配置不存在，就调用 getPrintersAsync 获取系统打印机列表，确定打印机的信息
  4. 调用 print 方法，传递打印机参数开始打印
  5. print 方法的回调函数中判断成功或失败，销毁 BrowserWindow，记录日志，渲染进程弹出提示

    ```mermaid
      flowchart TD
      A[渲染进程获取小票数据] --> B[打开新 BrowserWindow ]
      B --> C[加载小票数据，渲染小票HTML]
      C --> D[监听 webContents did-finish-load 事件，ipc 通信发送打印请求到主进程]
      D --> E1[主进程从数据库或接口获取打印机默认配置]
      D --> E2[主进程调用 getPrintersAsync 获取系统打印机列表]
      E1 --> F[组装打印机配置对象]
      E2 --> F[组装打印机配置对象]
      F --> G[调用 webContents.print 执行打印]
      G --> H[打印结果（成功/失败）反馈到渲染进程]
      H --> I[清理资源（关闭窗口]

    ```
