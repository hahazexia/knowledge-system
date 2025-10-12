# 开机自启动

electron 软件想要实现 windows 开机自启动的切换，只需要去修改注册表就行了

下面是主进程代码：

```ts
import { promisify } from 'node:util';
import child_process from 'node:child_process';
const execAsync = promisify(child_process.exec);

async function executeRegCommand(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { windowsHide: true });
    if (stderr) {
      global.log.info(`executeRegCommand stderr: ${stderr}`);
      throw new Error(stderr);
    }
    return stdout;
  } catch (err) {
    logErrorInfo(`executeRegCommand err`, err);
    throw err;
  }
}

ipcMain.handle('auto-start-on-boot', async (_, toggle: boolean) => {
  const regPath = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const PRODUCT_NAME = `app名字`;
  const EXE_NAME = `app名字.exe`;
  const EXEC_PATH = `${path.dirname(process.execPath)}\\${EXE_NAME}`;

  const addCommand = `reg add "${regPath}" /v "${PRODUCT_NAME}" /t REG_SZ /d "${EXEC_PATH}" /f`;
  const deleteCommand = `reg delete "${regPath}" /v "${PRODUCT_NAME}" /f`;

  try {
    await executeRegCommand(toggle ? addCommand : deleteCommand);
    return { code: 0 };
  } catch (err) {
    logErrorInfo(`auto-start-on-boot err`, err);
    return { code: -1 };
  }
});
```

下面是 preload 代码：

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ipc', {
  autoStartOnBoot: (toggle: boolean): Promise<any> => {
    return ipcRenderer.invoke('auto-start-on-boot', toggle);
  },
});
```

下面是渲染进程代码：

```ts
const autoStartRes = await window.ipc?.autoStartOnBoot(
  autoStartup.value === '1' ? true : false
);
if (autoStartRes.code === 0) {
  console.log('autoStartUpSuccess');
} else {
  console.log('autoStartUpFailed');
}
```

## reg 命令参数说明表

```cmd
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MyApp" /t REG_SZ /d "C:\Program Files\MyApp\app.exe" /f

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MyApp" /f
```

| 参数           | 作用说明                                                             | 示例值                                                                         |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `<注册表路径>` | 指定要添加键值对的注册表位置，需使用反斜杠 `\` 分隔层级              | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`（当前用户开机启动项路径） |
| `/v`           | 指定要创建的**键名**（即注册表中的“名称”列，如启动项的自定义名称）   | `MyTestApp`（自定义的开机启动项名称）                                          |
| `/t`           | 指定键值的数据类型，需使用系统规定的类型标识，常用字符串类型         | `REG_SZ`（字符串类型，适用于路径、文本等内容）                                 |
| `/d`           | 指定键名对应的**键值**（即注册表中的“数据”列，如程序路径、配置内容） | `"C:\Program Files\Test\Test.exe"`（程序完整路径，含空格需加双引号）           |
| `/f`           | 强制覆盖目标路径下已存在的同名键值对，执行时无需手动确认             | 无需额外值，命令中直接加 `/f` 即可（如 `reg add ... /f`）                      |
