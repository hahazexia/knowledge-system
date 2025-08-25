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

| xml 文件                | 说明                                                |
|-------------------------|---------------------------------------------------|
| install.xml             | 安装程序的入口                                      |
| configpage.xml          | 打开安装包后显示的第一个界面，也是选择安装路径的界面 |
| licensepage.xml         | 许可协议显示界面                                    |
| installingpage.xml      | 安装过程界面                                        |
| finishpage.xml          | 安装完成界面                                        |
| uninstallpage.xml       | 卸载入口界面                                        |
| uninstallingpage.xml    | 卸载过程界面                                        |
| uninstallfinishpage.xml | 卸载完成界面                                        |
| msgBox.xml              | 二级弹窗                                            |

- `nsis_publish/SetupScripts/nim/logo.ico` 是安装器图标，`nsis_publish/SetupScripts/nim/uninst.ico` 是卸载器图标

- `nsis_publish/SetupScripts/nim/ui_nim_setup.nsh` 中是主要逻辑

| 方法名         | 说明                            |
|----------------|-------------------------------|
| DUIPage        | 安装入口脚本，用于初始化一些信息 |
| un.DUIPage     | 卸载入口脚本                    |
| BindUIControls | 绑定安装的界面事件              |
| ShowMsgBox     | 显示二级子窗口                  |
| OnBtnInstall   | 安装主流程控制                  |

## nsis 语法

- Setup 安装程序是基于 NSIS 这个工具来制作的，使用了 `nsNiuniuSkin.dll` 这个插件来负责UI的控制

```nsh
Var InstallState
StrCpy $InstallState "0"

# Var是声明变量的关键字
# $符号用于引用变量
# StrCpy是字符串复制函数，语法为StrCpy $目标变量 "源字符串"

```

- nsis 脚本中有 20 个预设的变量

```nsh
$0 $1 $2 $3 $4 $5 $6 $7 $8 $9 $10
$11 $12 $13 $14 $15 $16 $17 $18 $19 $20
```
- 这些变量和自己写的变量用法是一样的，但通常用于共享的方法和宏中。这些变量不需要专门去声明，建议使用栈`stack`来存放这些变量的值。这些变量也可被用于插件间的通信，因为它们可被插件 DLL 文件读写。
  ```nsh
    # 表示将函数 OnBtnInstall 的地址获取后存入$0变量，后续可通过 $0 调用该函数。
    GetFunctionAddress $0 OnBtnInstall
  ```
- 还有 4 个变量


| 变量      | 说明                                                            |
|-----------|---------------------------------------------------------------|
| $INSTDIR  | 安装目录                                                        |
| $OUTDIR   | 输出目录                                                        |
| $CMDLINE  | 进入安装包的命令行                                              |
| $LANGUAGE | 当前使用的语言，可以在 onInit 回调中指定语言，英语 1033 中文 2052 |

- 有大量预设的常量可以使用

| 常量            | 说明                                                                                             |
|-----------------|------------------------------------------------------------------------------------------------|
| $PROGRAMFILES   | 在64位系统中指向C:\Program Files (x86)                                                           |
| $PROGRAMFILES32 | 指向C:\Program Files (x86)                                                                       |
| $PROGRAMFILES64 | 在64位系统中指向C:\Program Files                                                                 |
| $DESKTOP        | Windows桌面地址                                                                                  |
| $EXEDIR         | 安装包所在的目录                                                                                 |
| $EXEFILE        | 安装程序文件名                                                                                   |
| $EXEPATH        | $EXEDIR和$EXEFILE拼合到一起的安装文件全路径                                                      |
| ${NSISDIR}      | NSIS程序的安装目录地址，如D:\NSIS                                                                 |
| $WINDIR         | Windows目录地址，如C:\Windows                                                                     |
| $SYSDIR         | Windows下system目录地址，如C:\Windows\System32                                                    |
| $TEMP           | 系统临时目录地址，如C:\Users\linxinfa\AppData\Local\Temp                                          |
| $STARTMENU      | 开始菜单地址，如C:\Users\linxinfa\AppData\Roaming\Microsoft\Windows\Start Menu                    |
| $SMPROGRAMS     | 开始菜单下Programs地址，如C:\Users\linxinfa\AppData\Roaming\Microsoft\Windows\Start Menu\Programs |
| $QUICKLAUNCH    | 快速启动栏，如C:\Users\linxinfa\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch          |
| $DOCUMENTS      | “我的文档” 目录地址，如C:\Users\linxinfa\Documents                                                |
| $FONTS          | “字体” 目录地址，如C:\Windows\Fonts                                                               |
| $$              | 转义，用来表示 $                                                                                  |
| $\r             | 用来表示一个回车(\r)                                                                             |
| $\n             | 用来表示新的一行(\n)                                                                             |
| $\t             | 用来表示一个 Tab(\t)                                                                             |

- 其他语法

```nsh
# 函数定义
Function ShowMsgBox
	# 函数体
FunctionEnd

# 函数调用
Call ShowMsgBox

# 带返回值的函数
Function SimpleTest
  Push "OK"
FunctionEnd

# 调用带返回值的函数
Call SimpleTest
Pop $0
${If} $0 == "OK"
	MessageBox MB_OK|MB_ICONEXCLAMATION "函数返回了OK"
${EndIf}


# if 条件语句
# 安装界面点击退出，给出提示 
Function OnExitDUISetup
	${If} $InstallState == "0"		
		StrCpy $R8 "安装尚未完成，您确定退出安装么？"
		StrCpy $R7 "1"
		Call ShowMsgBox
		pop $0
		${If} $0 == 0
			goto endfun
		${EndIf}
	${EndIf}
	nsNiuniuSkin::ExitDUISetup
endfun:    
FunctionEnd

# 引入外部脚本：include
!include "StrFunc.nsh"
!include "LogicLib.nsh"
!include "..\commonfunc.nsh"

# 定义常量
!define INSTALL_PAGE_CONFIG 			0
!define INSTALL_PAGE_PROCESSING 		1
!define INSTALL_PAGE_FINISH 			2

# 以 ;或#开始的行为注释行。可以在命令后面添加注释，也可以使用C规范的注释来注释一行或多行。
; 注释
# 注释
/*
注释
注释
*/

```

## UI界面

- 布局：VerticalLayout 与 HorizontalLayout 布局分水平布局和垂直布局

  ```xml
    <VerticalLayout>
      <!-- 垂直布局 -->
    </VerticalLayout>
    <HorizontalLayout>
      <!-- 水平布局 -->
    </HorizontalLayout>
  ```

- 留空：Control 界面布局中，我们有时候需要做一些留空，我们可以使用Control来实现留空，有点类似html中的div。比如这里留了25个像素的空行

  ```xml
    <Control height="25" />
  ```

- 图片，图片路径是相对于 skin 目录
  ```xml
    <VerticalLayout width="480"
            height="250"
            roundcorner="5,5"
            bkimage="file='form\pic.png'">
  ```

- 显示文本，内边距：padding UI在布局中，可以设置相对于父控件的边距，顺序是：左、上、右、下

  ```xml
    <Label font="5"
      textcolor="#FF333333"
      text="安装路径："
      padding="40,0,30,0" />

  ```

- 显示按钮：Button，要指定各种状态的图片 normalimage 普通状态 hotimage 鼠标悬停状态 pushedimage 被点击状态 disabledimage 禁用状态

  ```xml
    <Button name="btnInstall"
      padding="95,10,95,30"
      height="40"
      normalimage="form\btn_installation_normal.png"
      hotimage="form\btn_installation_hovered.png"
      pushedimage="form\btn_installation_pressed.png"
      disabledimage="form\btn_installation_disable.png"
      font="6"
      textcolor="0xffffffff"
      disabledtextcolor="0xffffffff"
      margin="0,10,0,0"
      text="一键安装" />

  ```
- 图片也可以只使用一张图，设置不同坐标和大小
  - `source='0,0,29,26'`从图片左上角坐标(0,0)开始，截取宽 29px、高 26px 的区域作为正常状态图像
  - `source='0,26,29,52'` 截取坐标(0,26)到(29,52)的区域（即正常状态区域正下方的 26px 高度区域）
  - `source='0,52,29,78'` 截取坐标(0,52)到(29,78)的区域（即悬停状态区域正下方的 26px 高度区域）

  ```xml
    <Button name="btnClose" width="29" height="29"
      normalimage="file='form\close1.png' source='0,0,29,26'"
      hotimage="file='form\close1.png' source='0,26,29,52'"
      pushedimage="file='form\close1.png' source='0,52,29,78'" />

  ```

- 按钮的点击响应 比如一键安装按钮，在 xml 给按钮取名字叫"btnInstall"

  ```xml
    <Button name="btnInstall"
      padding="95,10,95,30"
      height="40"
      normalimage="form\btn_installation_normal.png"
      hotimage="form\btn_installation_hovered.png"
      pushedimage="form\btn_installation_pressed.png"
      disabledimage="form\btn_installation_disable.png"
      font="6"
      textcolor="0xffffffff"
      disabledtextcolor="0xffffffff"
      margin="0,10,0,0"
      text="一键安装" />
  ```

  - nsh 中通过名字来设置按钮的点击函数

  ```nsh
    GetFunctionAddress $0 OnBtnInstall
    nsNiuniuSkin::BindCallBack $hInstallDlg "btnInstall" $0

    # 开始安装
    Function OnBtnInstall

    FunctionEnd
  ```

- 输入框 例如 安装路径的输入框
  ```xml
    <RichEdit  name="editDir"
			text=""
			textcolor="0xFF000000"
			inset="5,8,2,2"
			bkimage="public\edit\edit0.png"
			autohscroll="false"
			bordervisible="true"
			bordersize="1"
			bordercolor="0xFFD1D1D1"
			focusbordercolor="0xFFD1D1D1"
			wantreturn="false"
			wantctrlreturn="false"
			multiline="false"
			width="360" />

  ```

  - nsh中设置默认安装路径

    ```nsh
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "editDir" "text" "$INSTDIR\"
    ```

  - 获取路径输入框中的文本
    ```nsh
      nsNiuniuSkin::GetControlAttribute $hInstallDlg "editDir" "text"
      Pop $0	
      StrCpy $INSTDIR "$0"
    ```

- 禁用和激活 UI 比如通过许可协议的勾选来控制按钮的禁用与激活

  ```nsh
    #根据选中的情况来控制按钮是否灰度显示 
    Function OnCheckLicenseClick
      nsNiuniuSkin::GetControlAttribute $hInstallDlg "chkAgree" "selected"
        Pop $0
      ${If} $0 == "0"
        nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnInstall" "enabled" "true"
      ${Else}
        nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnInstall" "enabled" "false"
        ${EndIf}
    FunctionEnd
  ```

- Slider 进度条

  ```xml
  <Slider name="slrProgress"
    padding="30,0,30,0"
    height="3"
    mouse="false"
    foreimage="form\fg.png"
    bkimage="form\bg.png"
    thumbsize="0,0"
    bkcolor="#FFD8D8D8"  />
  ```
  - nsh中更新进度条

    ```nsh
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "slrProgress" "value" "$0"
    ```

- 页面切换 安装程序会有多个页面，比如安装向导界面、安装中界面、安装完成界面等，每个界面有对应的ID我们需要在逻辑中做界面切换。在 install.xml 中会先配置好这些界面的 xml，如下

  ```xml
    <TabLayout name="wizardTab"  >
      <Include source="configpage.xml" />
      <Include source="installingpage.xml" />
      <Include source="finishpage.xml" />
      <Include source="uninstallpage.xml" />
      <Include source="uninstallingpage.xml" />
      <Include source="uninstallfinishpage.xml" />
    </TabLayout>

  ```
  - 在代码中，定义好它们的 ID
    ```nsh
      !define INSTALL_PAGE_CONFIG 			0
      !define INSTALL_PAGE_PROCESSING 		1
      !define INSTALL_PAGE_FINISH 			2
      !define INSTALL_PAGE_UNISTCONFIG 		3
      !define INSTALL_PAGE_UNISTPROCESSING 	4
      !define INSTALL_PAGE_UNISTFINISH 		5

    ```
  - 然后通过接口进行切换界面
    ```nsh
      nsNiuniuSkin::ShowPageItem $hInstallDlg "wizardTab" ${INSTALL_PAGE_PROCESSING}
    ```

- 路径选择 用户可以选择自定义安装，选择安装的路径，我们可以调用 nsNiuniuSkin::SetControlAttribute 这个接口弹出路径选择窗口

  ```nsh
    Function OnBtnSelectDir
        nsNiuniuSkin::SelectInstallDirEx $hInstallDlg "请选择安装路径"
        Pop $0
        # 如果选择路径不为空，则赋值到editDir这个编辑框中，注意Unless的含义，它等价于if的否
      ${Unless} "$0" == ""
        nsNiuniuSkin::SetControlAttribute $hInstallDlg "editDir" "text" $0
      ${EndUnless}
    FunctionEnd

  ```

- 弹出提示框 比如关闭安装程序的时候弹出提示框 对应的布局 xml 文件是 msgBox.xml

  ```nsh
    Function ShowMsgBox
      nsNiuniuSkin::InitSkinSubPage "msgBox.xml" "btnOK" "btnCancel,btnClose"  ; "提示" "${PRODUCT_NAME} 正在运行，请退出后重试!" 0
      Pop $hInstallSubDlg
      nsNiuniuSkin::SetControlAttribute $hInstallSubDlg "lblTitle" "text" "提示"
      nsNiuniuSkin::SetControlAttribute $hInstallSubDlg "lblMsg" "text" "$R8"
      ${If} "$R7" == "1"
        nsNiuniuSkin::SetControlAttribute $hInstallSubDlg "btnCancel" "visible" "true"
      ${EndIf}
    FunctionEnd
  ```
  - $R8 变量存放显示的文本，$R7 变量控制是否显示取消按钮
    ```nsh
      #安装界面点击退出，给出提示 
      Function OnExitDUISetup
        ${If} $InstallState == "0"		
          StrCpy $R8 "安装尚未完成，您确定退出安装么？"
          StrCpy $R7 "1"
          Call ShowMsgBox
          pop $0
          ${If} $0 == 0
            goto endfun
          ${EndIf}
        ${EndIf}
        nsNiuniuSkin::ExitDUISetup
      endfun:    
      FunctionEnd

    ```

- 获取和修改界面 UI 控件的属性 每个 UI 控件都有各自的属性，比如 visible、pos、height 等。安装程序运行中，我们需要根据情况动态修改 UI 控件的属性，点击下拉和收起按钮，我们需要对应得调整窗口

  ```nsh
    # 展开
    Function OnBtnShowMore	
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnShowMore" "enabled" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnHideMore" "enabled" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "moreconfiginfo" "visible" "true"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnHideMore" "visible" "true"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnShowMore" "visible" "false"
      # 调整窗口高度 
      GetFunctionAddress $0 StepHeightSizeAsc
      BgWorker::CallAndWait
    FunctionEnd

    # 收起
    Function OnBtnHideMore
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnShowMore" "enabled" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnHideMore" "enabled" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "moreconfiginfo" "visible" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnHideMore" "visible" "false"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnShowMore" "visible" "true"
      ;调整窗口高度
      GetFunctionAddress $0 StepHeightSizeDsc
        BgWorker::CallAndWait
      nsNiuniuSkin::SetWindowSize $hInstallDlg 600 390
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnShowMore" "enabled" "true"
      nsNiuniuSkin::SetControlAttribute $hInstallDlg "btnHideMore" "enabled" "true"
    FunctionEnd
  ```

- UI 控件常用的属性

| 属性名           | 数据类型  | 默认值     | 描述                           |
|------------------|-----------|------------|------------------------------|
| pos              | RECT      | 0,0,0,0    | 位置                           |
| padding          | RECT      | 0,0,0,0    | 内边距                         |
| bkcolor          | DWORD     | 0x00000000 | 背景颜色                       |
| bordercolor      | DWORD     | 0x00000000 | 边框颜色                       |
| focusbordercolor | DWORD     | 0x00000000 | 获得焦点时边框的颜色           |
| bordersize       | INT或RECT | 0          | 边框大小，可以用INT也可以用RECT |
| leftbordersize   | INT       | 0          | 左边边框大小                   |
| topbordersize    | INT       | 0          | 顶部边框大小                   |
| rightbordersize  | INT       | 0          | 右边边框大小                   |
| bottombordersize | INT       | 0          | 底部边框大小                   |
| borderstyle      | INT       | 0          | 边框样式，数值范围0~5           |
| borderround      | SIZE      | 0,0        | 边框圆角半径，如(2,2)           |
| bkimage          | STRING    | ""         | 背景图片                       |
| width            | INT       | 0          | 宽度                           |
| height           | INT       | 0          | 高度                           |
| minwidth         | INT       | 0          | 最小宽度                       |
| minheight        | INT       | 0          | 最小高度                       |
| maxwidth         | INT       | 0          | 最大宽度                       |
| maxheight        | INT       | 0          | 最大高度                       |
| text             | STRING    | ""         | 显示的文本                     |
| tooltip          | STRING    | ""         | 鼠标悬停提示文本               |
| enabled          | BOOL      | true       | 是否响应用户操作               |
| mouse            | BOOL      | true       | 是否响应鼠标操作               |
| visible          | BOOL      | true       | 是否可见                       |
| float            | BOOL      | false      | 是否使用绝对定位               |


## 参考链接

- [nsNiuniuSkin github](https://github.com/leeqia/nsNiuniuSkin)
- [分享一个使用 NSIS 制作安装包的 UI 插件](http://ggniu.cn/articles/nsniuniuskin.html)
- [nsNiuniuSkin download](http://www.leeqia.com/nsniuniuskin/download/)
- [nsNiuniuSkin 使用教程](https://blog.csdn.net/qq_43915356/article/details/130813351)
