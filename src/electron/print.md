# 调用打印机打印小票

- 现在需要实现 electron 应用调用系统打印机然后打印小票的功能，主进程的核心功能实现一个 `Printer` 类

  1. 首先在渲染进程获取到需要打印的小票数据，以及各种所需要的配置项，比如小票页面的样式配置，用户设置的默认打印机，然后将这些数据组装好，发送 `ipc` 到主进程请求打印
  2. 主进程收到请求后，将数据传递给 `Printer` 类的 `print` `静态方法，print` 方法主要做的事情就是新建一个 `BrowserWindow` `用来加载小票预览页面，BrowserWindow` 初次加载会触发 `BrowserWindow.webContents` 的 `did-finish-load` 事件
  3. 监听 `did-finish-load` 到事件触发，说明窗口已经加载完成，这时候调用 `Printer.renderPrintDocument` 方法，去将小票预览页需要的所有数据发送给 `BrowserWindow` 的页面，并且注册双向的 `ipc` 事件，用来监听页面渲染数据成功的时机
  4. 页面接收到小票数据之后，会渲染网页，在页面 `nextTick` 之后发送响应的 `ipc` 事件回去，通知主进程预览页已经加载好，可以开始打印了，主进程收到这个响应之后，经过一些预览日志记录工作以及打印页面尺寸的计算工作之后，就正式调用 `BrowserWindow.webContents.print` 方法启动操作系统的打印
  5. 监听打印结果，成功或者失败，记录日志，然后关闭 `BrowserWindow`

  ```mermaid
    flowchart TD
    A[渲染进程获取小票数据] --> B[请求主进程打印 ]
    B --> C[主进程新建 BrowserWindow ]
    C --> D[监听 BrowserWindow.webContents did-finish-load 事件，主进程将数据传输给渲染进程]
    D --> E[渲染进程渲染完毕，通知主进程]
    E --> F[主进程记录预览日志，计算尺寸单位转换，调用 BrowserWindow.webContents.print]
    F --> G[打印结果（成功/失败）反馈到渲染进程]
    G --> H[清理资源（关闭窗口）]
  ```

## 实现

- 下面是主进程首次接收到渲染进程的 ipc 请求要求打印

```ts
// 监听渲染进程发送的"invoke-printer-to-print"打印请求事件
// 当渲染进程需要调用打印机时，会触发此事件
ipcMain.on(
  'invoke-printer-to-print',
  async (_, dataToPrint: any, printerConfig: any) => {
    try {
      // 记录打印数据和配置信息到日志（便于调试）
      log.info(
        `invoke-printer-to-print dataToPrint: ${JSON.stringify(dataToPrint)}`
      );
      log.info(
        `invoke-printer-to-print printerConfig: ${JSON.stringify(
          printerConfig
        )}`
      );
    } catch (err) {
      // 捕获日志记录过程中的错误
      logErrorInfo('log dataToPrint err', err);
    }

    // 从配置中获取默认打印机名称和打印份数
    let defaultPrinter = printerConfig.printName;
    let copies = printerConfig.copies;

    // 如果配置中没有指定打印机名称，则自动查找包含"80mm"的打印机
    if (!printerConfig.printName) {
      // 获取系统中所有可用打印机列表
      const printers = await (
        global.win as BrowserWindow
      ).webContents.getPrintersAsync();

      // 查找名称包含"80mm"的打印机（通常是80毫米宽的热敏打印机）
      defaultPrinter = printers.find(i => i.name.includes('80mm'))
        ?.name as string;
    }

    // 确定打印模板HTML文件的路径（区分开发环境和生产环境）
    let filePath = '';
    if (app.isPackaged) {
      // 生产环境：使用打包后的本地文件路径
      filePath = path.join(app.getAppPath(), 'maindist/printer.html');
    } else {
      // 开发环境：使用本地开发服务器的URL
      filePath = 'http://localhost:5173/printer.html';
    }

    // 组装打印选项配置
    const options = {
      pageSize: '80mm' as PaperSize, // 纸张尺寸为80毫米
      htmlPath: filePath, // 打印模板的路径
      preview: false, // 不启用预览模式
      printerName: defaultPrinter, // 目标打印机名称
      silent: true, // 静默打印（不弹出打印对话框）
      copies, // 打印份数
    };

    // 调用Printer类的print方法执行打印
    Printer.print(dataToPrint, options)
      .then((res: PrintRes) => {
        // 打印成功后，向渲染进程发送打印结果
        global.win?.webContents.send('print-result', res);
      })
      .catch((err: any) => {
        // 打印失败时，向渲染进程发送错误信息
        global.win?.webContents.send('print-result', err);
      });
  }
);
```

- 下面是打印类的文件 printer.ts

```ts
// 导入所需的类型和工具函数
import { PrintOptions, PrintRes } from './types'; // 导入打印相关的类型定义
import { logErrorInfo } from '../utils.js'; // 导入错误日志记录工具
import { app, BrowserWindow } from 'electron'; // 导入Electron的app和BrowserWindow模块
import { fileURLToPath } from 'node:url'; // 用于将URL转换为文件路径
import path from 'node:path'; // 用于处理文件路径
import {
  parsePaperSizeInMicrons, // 解析纸张尺寸为微米单位
  convertPaperSizeInPixels, // 将纸张尺寸转换为像素单位
  sendIpcMsg, // 发送IPC消息
  convertPixelsToMicrons, // 将像素转换为微米
  savePreviewHtml, // 保存预览HTML
  savePreviewImage, // 保存预览图片
} from './utils.js'; // 导入打印相关的工具函数

// 处理当前模块的文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 打印机类，用于处理打印相关操作
 */
export class Printer {
  /**
   * 打印数据的静态方法
   * @param data - 需要打印的数据数组
   * @param options - 打印选项配置
   * @returns 返回一个Promise，包含打印结果
   */
  public static print(data: any[], options: PrintOptions): Promise<PrintRes> {
    // 记录打印开始日志，包含数据长度和选项信息
    global.log.info(
      `Printer.print data length: ${data.length}, options: ${JSON.stringify(
        options
      )}`
    );

    return new Promise((resolve, reject) => {
      // 从选项中解构所需参数，设置默认值
      const {
        pageSize, // 纸张尺寸
        htmlPath, // HTML模板路径
        preview, // 是否预览模式
        printerName, // 打印机名称
        silent = true, // 是否静默打印，默认true
        copies = 1, // 打印份数，默认1
      } = options;

      // 创建一个新的浏览器窗口用于打印
      let win = new BrowserWindow({
        show: !!preview, // 根据预览模式决定是否显示窗口
        ...convertPaperSizeInPixels(pageSize), // 应用转换后的纸张尺寸作为窗口大小
        webPreferences: {
          nodeIntegration: false, // 禁用节点集成，提高安全性
          preload: path.join(__dirname, './preloadPrinter.js'), // 预加载脚本路径
        },
      });

      // 调试用：打开开发者工具
      // win.webContents.openDevTools();

      // 窗口关闭时清理引用
      win.on('closed', () => {
        (win as any) = null;
      });

      // 监听 BrowserWindow 加载完成事件
      win.webContents.on('did-finish-load', () => {
        global.log.info(`did-finish-load`);

        // 渲染打印文档并处理后续打印操作
        Printer.renderPrintDocument(win, data)
          .then(async res => {
            global.log.info(`did-finish-load then res ${res}`);

            // 解析纸张尺寸为微米单位
            let { width, height } = parsePaperSizeInMicrons(options.pageSize);
            global.log.info(`original width: ${width} height: ${height}`);

            // 如果纸张尺寸是字符串类型（可能是自定义尺寸），需要重新计算
            if (typeof pageSize === 'string') {
              // 获取页面内容的实际宽高（像素）
              const clientHeight = await win.webContents.executeJavaScript(
                'document.body.clientHeight'
              );
              const clientWidth = await win.webContents.executeJavaScript(
                'document.body.clientWidth'
              );

              // 将像素转换为微米
              height = convertPixelsToMicrons(clientHeight);
              width = convertPixelsToMicrons(clientWidth);
              global.log.info(
                `Printer.print clientHeight: ${clientHeight}, height: ${height} \n clientWidth: ${clientWidth}, width: ${width}`
              );
            }

            // 调整最终打印尺寸（减去边距等）
            width = width - convertPixelsToMicrons(20);
            height = height + convertPixelsToMicrons(50);

            global.log.info(`final print width: ${width}, height: ${height}`);

            // 执行打印操作
            win.webContents.print(
              {
                copies: copies, // 打印份数
                silent: silent, // 是否静默打印
                deviceName: printerName, // 目标打印机名称
                pageSize: {
                  width: width, // 最终打印宽度（微米）
                  height: height, // 最终打印高度（微米）
                },
              },
              // 打印完成回调
              (success: boolean, failReason: string) => {
                if (!success) {
                  // 打印失败时记录错误
                  logErrorInfo(`Printer.print failReason ${failReason}`, {});
                  reject({
                    success,
                    reason: failReason,
                  });
                }
                // 无论成功与否都返回结果并关闭窗口
                resolve({
                  success,
                  reason: failReason,
                });
                win.close();
              }
            );
          })
          .catch((err: any) => {
            // 处理渲染过程中的错误
            logErrorInfo(`Printer.print did-finish-load err`, err);
            reject({
              success: false,
              reason: err.message,
            });
          });
      });

      // 加载打印用的HTML模板
      if (htmlPath) {
        global.log.info(`htmlPath ${htmlPath}`);

        // 根据应用是否打包选择不同的加载方式
        if (app.isPackaged) {
          win.loadFile(htmlPath); // 打包后加载本地文件
        } else {
          win.loadURL(htmlPath); // 开发环境加载URL
        }
      }
    });
  }

  /**
   * 渲染打印文档的私有静态方法
   * @param win - 浏览器窗口实例
   * @param data - 需要渲染的数据
   * @returns 返回一个Promise，表示渲染是否成功
   */
  private static renderPrintDocument(win: BrowserWindow, data: any) {
    return new Promise(async (resolve, reject) => {
      // 发送IPC消息渲染打印数据
      await sendIpcMsg('render-print-data', win.webContents, data)
        .then(async (result: any) => {
          if (result) {
            // 获取渲染后的HTML内容并保存预览
            const printPreviewHtml = await win.webContents.executeJavaScript(
              'document.documentElement.outerHTML'
            );
            await savePreviewHtml(printPreviewHtml); // 保存HTML预览
            await savePreviewImage(win); // 保存图片预览
          }

          // 如果渲染失败，关闭窗口并拒绝Promise
          if (!result.status) {
            window.close();
            reject(result.error);
            return;
          }
        })
        .catch(error => {
          // 处理IPC通信错误
          reject(error);
          return;
        });
      // 渲染完成
      resolve('render complete');
    });
  }
}
```

- 下面是工具方法的文件 utils.ts

```ts
import { SizeOptions, PaperSize } from './types';
import { ipcMain, app, BrowserWindow } from 'electron'; // 引入Electron主进程模块
import path from 'node:path';
import fsSync from 'node:fs';
import { format } from 'date-fns';
import { ensureDir, logErrorInfo } from '../utils.js';

/**
 * 主进程向渲染进程发送IPC消息并等待回复的工具函数
 * 用于打印相关的进程间通信（如传递打印参数、获取打印状态等）
 * @param channel 通信频道名
 * @param webContents 目标渲染进程的webContents对象
 * @param arg 发送的参数（可能包含打印配置、纸张大小等信息）
 * @returns 包含回复结果的Promise
 */
export function sendIpcMsg(channel: any, webContents: any, arg: any) {
  return new Promise((resolve, reject) => {
    // 监听渲染进程的回复消息
    ipcMain.once(`${channel}-reply`, (event, result) => {
      global.log.info(`${channel}-reply result: ${JSON.stringify(result)}`);
      if (result.status) {
        resolve(result); // 成功时返回结果
      } else {
        reject(result.error); // 失败时返回错误
      }
    });
    // 向渲染进程发送消息（触发打印相关操作）
    webContents.send(channel, arg);
  });
}

/**
 * 将纸张大小转换为微米单位（打印系统常用单位）
 * 用于设置打印时的纸张尺寸参数
 * @param pageSize 纸张大小（预设尺寸字符串或自定义像素尺寸对象）
 * @returns 转换后的微米单位宽高
 */
export function parsePaperSizeInMicrons(pageSize?: PaperSize | SizeOptions): {
  width: number;
  height: number;
} {
  let width = 80000, // 默认宽度（80mm对应的微米）
    height = 10000; // 默认高度
  if (typeof pageSize == 'string') {
    // 处理预设纸张尺寸（常见打印纸宽度）
    switch (pageSize) {
      case '44mm':
        width = Math.ceil(44 * 1000);
        break;
      case '57mm':
        width = Math.ceil(57 * 1000);
        break;
      case '58mm':
        width = Math.ceil(58 * 1000);
        break;
      case '76mm':
        width = Math.ceil(76 * 1000);
        break;
      case '78mm':
        width = Math.ceil(78 * 1000);
        break;
      case '80mm':
        width = Math.ceil(80 * 1000);
        break;
    }
  } else if (typeof pageSize == 'object') {
    // 处理自定义尺寸（从像素转换为微米）
    width = convertPixelsToMicrons(pageSize.width);
    height = convertPixelsToMicrons(pageSize.height);
  }

  return {
    width,
    height,
  };
}

/**
 * 将像素单位转换为微米单位
 * 打印系统中常用微米作为尺寸单位，此函数用于像素到物理单位的转换
 * @param pixels 像素值
 * @returns 转换后的微米值
 */
export function convertPixelsToMicrons(pixels: number): number {
  // 换算逻辑：1英寸 = 25.4毫米 = 25400微米（因为1毫米=1000微米）
  // 同时在96dpi（ dots per inch，每英寸像素数）的屏幕密度下，1英寸 = 96像素
  // 因此1像素对应的微米数 = 总微米数 ÷ 总像素数 = 25400微米 ÷ 96像素
  const MICRONS_PER_PX = 25400 / 96;

  // 将像素数乘以1像素对应的微米数，得到总微米数
  // 使用Math.ceil向上取整，避免小数精度问题导致的尺寸偏差
  return Math.ceil(pixels * MICRONS_PER_PX);
}

/**
 * 将纸张大小转换为像素单位（用于前端预览）
 * 用于在渲染进程中展示打印内容的预览效果
 * @param pageSize 纸张大小（预设尺寸字符串或自定义像素尺寸对象）
 * @returns 转换后的像素单位宽高
 */
export function convertPaperSizeInPixels(pageSize?: PaperSize | SizeOptions): {
  width: number;
  height: number;
} {
  let width = 302, // 默认宽度（80mm对应的像素）
    height = 1200; // 默认高度
  if (typeof pageSize == 'string') {
    // 处理预设纸张尺寸（转换为对应像素宽度）
    switch (pageSize) {
      case '44mm':
        width = 166;
        break;
      case '57mm':
        width = 215;
        break;
      case '58mm':
        width = 219;
        break;
      case '76mm':
        width = 287;
        break;
      case '78mm':
        width = 295;
        break;
      case '80mm':
        width = 302;
        break;
    }
  } else if (typeof pageSize == 'object') {
    // 直接使用自定义像素尺寸
    width = pageSize.width;
    height = pageSize.height;
  }

  return {
    width,
    height,
  };
}

/**
 * 保存打印预览的HTML内容到本地文件
 * 用于调试和记录打印内容，辅助排查打印格式问题
 * @param html 预览页面的HTML字符串
 */
export async function savePreviewHtml(html: string) {
  // 定义保存目录（用户数据目录下的logs_printer文件夹）
  const saveDir = path.join(app.getPath('userData'), 'logs_printer');

  await ensureDir(saveDir); // 确保目录存在

  try {
    // 写入HTML文件（文件名包含时间戳）
    fsSync.writeFileSync(
      path.join(
        saveDir,
        `print-preview-${format(new Date(), 'yyyy-MM-dd.HH_mm_ss')}.html`
      ),
      html
    );
  } catch (err) {
    logErrorInfo('savePreviewHtml failed err', err);
  }
}

/**
 * 捕获打印预览窗口的图像并保存为PNG
 * 用于可视化记录打印效果，辅助调试打印样式
 * @param win 预览窗口的BrowserWindow实例
 */
export async function savePreviewImage(win: BrowserWindow) {
  try {
    // 捕获窗口内容（保持窗口隐藏状态）
    const nativeImg = await win.webContents.capturePage(undefined, {
      stayHidden: true,
    });
    const pngBuf = nativeImg.toPNG(); // 转换为PNG格式
    const saveDir = path.join(app.getPath('userData'), 'logs_printer');
    await ensureDir(saveDir);
    // 写入PNG文件（文件名包含时间戳）
    fsSync.writeFileSync(
      path.join(
        saveDir,
        `print-preview-${format(new Date(), 'yyyy-MM-dd.HH_mm_ss')}.png`
      ),
      pngBuf
    );

    // 检查捕获状态，输出错误日志
    if (!win.webContents.isBeingCaptured()) {
      global.log.error('savePreviewImage not working');
    }
  } catch (err) {
    logErrorInfo('savePreviewImage err', err);
  }
}
```

## 总结

- 此解决方案灵感来源于 [electron-pos-printer](https://www.npmjs.com/package/electron-pos-printer) 这个包的源码实现，其实打印功能实现的重点就是页面的像素单位和打印机可以识别的微米单位的互相转换
- 其实有个地方还可以继续优化，就是这里计算打印尺寸的时候，直接使用了默认的 dpi 为 96，如果用户的显示器分辨率比较高，dpi 值更大，这里尺寸的转换就会出现精度问题，应该通过浏览器的 `window.devicePixelRatio` 接口动态获取用户的显示器像素比，计算的时候用默认 dpi 乘以 `devicePixelRatio` 就可以了， `96 * devicePixelRatio`

## 参考链接

- [contents.print([options], [callback])](https://www.electronjs.org/zh/docs/latest/api/web-contents#contentsprintoptions-callback)
- [electron-pos-printer](https://www.npmjs.com/package/electron-pos-printer)
