# 集成自定义 nsis 打包

- `electron-builder` 自带的 nsis 最后的安装包界面比较普通简陋，并且不能自定义所有界面的样式，因此大多数情况下可能需要自己编写 nsis 脚本制作安装包，或者使用第三方的 nsis 插件来制作安装包，这时候就需要调整升级的逻辑，因为 `electron-builder` 只为自带的 nsis 提供升级文件的生成，如果要自己打包 nsis，那么需要自己写脚本生成对应的 `latest.yml` 升级文件

- 这里使用的是 `nsNiuniuSkin` 这个第三方制作 nsis 的插件

## 集成 nsNiuniuSkin

- 首先去 [nsNiuniuSkin](http://www.leeqia.com/nsniuniuskin/download/) 官网下载插件，下载后解压到项目根目录下

```json
nsis_publish
└─FilesToInstall // 放需要打包的文件
  ├─locales
  ├─resources
  │ ├─app.asar.unpacked
  │ ├─app-update.yml
  │ ├─app.asar
  ├─chrome_100_percent.pak
  ├─chrome_200_percent.pak
  ├─d3dcompiler_47.dll
  ├─electron-update.exe
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
└─NSIS // NSIS完整软件
└─Output // 输出目录，打包好的安装包会放到这里
  ├─electron-update_V0.0.18.exe
└─SetupScripts
  ├─nim
  │ ├─skin
  │ ├─icon.ico
  │ ├─licence.rtf
  │ ├─license.txt // 协议文件
  │ ├─nim_setup.nsi // nsis 脚本入口
  │ ├─skin.zip
  │ ├─ui_nim_setup.nsh // nsis 脚本
  │ ├─uninst.ico
  ├─app.7z
  ├─app.nsh
  ├─commonfunc.nsh // nsis 脚本通用函数
└─7z.dll
└─7z.exe
└─安装包报毒解决方法.txt
└─打包配置及流程说明.doc
└─build-nim-nozip.bat
└─build-nim.bat
└─Description_of_NiuniuSetupSkin.doc
└─getCodeStructure.cjs
└─makeapp.bat
└─makensiscode.bat
└─makeskinzip.bat
└─NSIS.chm
```

- 修改 `nsis_publish/SetupScripts/nim/nim_setup.nsi` 入口文件的基本信息

```bash
# ====================== 自定义宏 产品信息==============================
!define PRODUCT_NAME           		"electron-update"  # 软件名
!define PRODUCT_PATHNAME 			"electron-update"  #安装卸载项用到的KEY
!define INSTALL_APPEND_PATH         "electron-update"	  #安装路径追加的名称
!define INSTALL_DEFALT_SETUPPATH    ""       #默认生成的安装路径
!define EXE_NAME               		"electron-update.exe" # 可执行文件名字
!define PRODUCT_VERSION        		"0.0.18.0" # nsis 版本号，这里后续会使用 VIProductVersion 来设置安装程序的 VS_FIXEDFILEINFO 版本信息块中的版本号，必须4位
!define PRODUCT_SHOW_VERSION        "0.0.18" # 对外显示的版本号
!define PRODUCT_PUBLISHER      		"hahazexia" # 软件发布者
!define PRODUCT_LEGAL          		"hahazexia 2025" # 版权信息
!define INSTALL_OUTPUT_NAME    		"${PRODUCT_NAME}_V${PRODUCT_SHOW_VERSION}.exe" # 安装包文件最终的名字

# ====================== 自定义宏 安装信息==============================
!define INSTALL_7Z_PATH 	   		"..\app.7z"
!define INSTALL_7Z_NAME 	   		"app.7z"
!define INSTALL_RES_PATH       		"skin.zip"
!define INSTALL_LICENCE_FILENAME    "license.txt"
!define INSTALL_ICO 				"icon.ico"
!define UNINSTALL_ICO 				"uninst.ico"

; Compression algorithm configuration (must be placed at the very beginning of the script)
; Use LZMA algorithm with solid compression (highest compression ratio)
; SetCompressor /SOLID lzma # 可以开启 lzma 压缩

; Set compression dictionary size (optional, range 4-64, unit: MB)
; Larger values provide better compression but increase compression time, 16 or 32 recommended
; SetCompressorDictSize 4 # 设置压缩字典大小

!include "ui_nim_setup.nsh" # 引入主脚本

# ==================== NSIS属性 ================================

# 针对Vista和win7 的UAC进行权限请求.
# RequestExecutionLevel none|user|highest|admin
RequestExecutionLevel admin


; 安装包名字.
Name "${PRODUCT_NAME}"

# 安装程序文件名.

OutFile "..\..\Output\${INSTALL_OUTPUT_NAME}"

;$PROGRAMFILES32\Netease\NIM\

InstallDir "1"

# 安装和卸载程序图标
Icon              "${INSTALL_ICO}"
UninstallIcon     "${UNINSTALL_ICO}"

```

- 修改 `nsis_publish/SetupScripts/nim/ui_nim_setup.nsh` 文件中的静默安装入口函数，放在 silentInstallSec 中的方法会在自动升级的时候提供静默安装的能力

```bash
# 添加一个静默安装的入口
Section "silentInstallSec" SEC01
    #MessageBox MB_OK|MB_ICONINFORMATION "Test silent install. you can add your silent install code here."
	; FileOpen $0 "$DESKTOP\silent_install.log" w
    ; FileWrite $0 "enter silent install section 1 \r\n"
    ; FileClose $0

    Pop $0

	Call GenerateSetupAddress

    GetFunctionAddress $0 ExtractFunc
    BgWorker::CallAndWait

	SetShellVarContext all
	CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${EXE_NAME}"
	SetShellVarContext current

	Call CreateAppShortcut

	Call CreateUninstall

	StrCpy $InstallState "1"

	Call OnFinished
SectionEnd
```

- 然后可以去 `nsis_publish/SetupScripts/nim/skin` 目录下修改 xml 文件和图片文件，xml 文件就对应了安装包中的页面

| xml 文件                | 说明                                                 |
| ----------------------- | ---------------------------------------------------- |
| install.xml             | 安装程序的入口                                       |
| configpage.xml          | 打开安装包后显示的第一个界面，也是选择安装路径的界面 |
| licensepage.xml         | 许可协议显示界面                                     |
| installingpage.xml      | 安装过程界面                                         |
| finishpage.xml          | 安装完成界面                                         |
| uninstallpage.xml       | 卸载入口界面                                         |
| uninstallingpage.xml    | 卸载过程界面                                         |
| uninstallfinishpage.xml | 卸载完成界面                                         |
| msgBox.xml              | 二级弹窗                                             |

- `nsis_publish/SetupScripts/nim/logo.ico` 是安装器图标，`nsis_publish/SetupScripts/nim/uninst.ico` 是卸载器图标

- `nsis_publish/SetupScripts/nim/ui_nim_setup.nsh` 中是主要逻辑

| 方法名         | 说明                             |
| -------------- | -------------------------------- |
| DUIPage        | 安装入口脚本，用于初始化一些信息 |
| un.DUIPage     | 卸载入口脚本                     |
| BindUIControls | 绑定安装的界面事件               |
| ShowMsgBox     | 显示二级子窗口                   |
| OnBtnInstall   | 安装主流程控制                   |

## 参考链接

- [nsNiuniuSkin github](https://github.com/leeqia/nsNiuniuSkin)
- [分享一个使用 NSIS 制作安装包的 UI 插件](http://ggniu.cn/articles/nsniuniuskin.html)
- [nsNiuniuSkin download](http://www.leeqia.com/nsniuniuskin/download/)
- [nsNiuniuSkin 使用教程](https://blog.csdn.net/qq_43915356/article/details/130813351)
