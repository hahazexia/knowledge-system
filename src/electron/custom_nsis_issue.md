# 解决自定义 nsis 安装包带来的全量升级问题

- 之前依赖 `electron-builder` 和 `electron-updater` 的升级，会因为使用了自定义 nsis 安装包而失败

  - 因为 `electron-updater` 的升级是依赖其根据 `electron-builder` 自己生成的 nsis 安装包计算出来的文件哈希值，所以 latest.yml 文件中的哈希值就和自定义 nsis 包不匹配了，因此会导致检测升级失败

- 解决方案就是自己重新计算自定义 nsis 包的哈希值，然后重新生成 latest.yml 文件

## 步骤

- 去扒 `electron-builder` 的源码 `packages\electron-updater\src\DownloadedUpdateHelper.ts` 文件中有这样一段代码，这其实就是 `electron-builder` 内部计算安装包文件哈希值的方法

  ```ts
  import { createHash } from 'crypto';
  import { createReadStream } from 'fs';

  /**
   * 计算文件的哈希值（异步函数）
   * @param file 要计算哈希值的文件路径
   * @param algorithm 哈希算法，默认为 'sha512'
   * @param encoding 输出结果的编码格式，支持 'base64' 或 'hex'，默认为 'base64'
   * @param options 传递给文件读取流的可选参数
   * @returns 返回包含哈希值的Promise对象
   */
  function hashFile(
    file: string,
    algorithm = 'sha512',
    encoding: 'base64' | 'hex' = 'base64',
    options?: any
  ): Promise<string> {
    // 返回Promise对象以支持异步操作
    return new Promise<string>((resolve, reject) => {
      // 使用指定的算法创建哈希对象
      const hash = createHash(algorithm);

      // 监听哈希过程中的错误，并将错误传递给reject
      // 同时设置哈希结果的输出编码格式
      hash.on('error', reject).setEncoding(encoding);

      // 创建文件读取流，以流的方式处理文件（适合大文件）
      createReadStream(file, {
        // 合并用户传入的选项
        ...options,
        // 设置每次读取的缓冲区大小为1MB（1024*1024字节）
        // 较大的缓冲区可以提高处理速度，减少I/O操作次数
        highWaterMark:
          1024 * 1024 /* better to use more memory but hash faster */,
      })
        // 监听文件读取过程中的错误
        .on('error', reject)
        // 当文件读取完成时触发
        .on('end', () => {
          // 结束哈希计算
          hash.end();
          // 读取哈希结果并通过resolve返回
          resolve(hash.read() as string);
        })
        // 将文件流通过管道传递给哈希对象进行处理
        // { end: false } 表示文件流结束时不自动结束哈希计算，需要手动调用hash.end()
        .pipe(hash, { end: false });
    });
  }
  ```

- 解决了核心问题哈希值的计算 ，现在我们就可以来写一个一键脚本的流程来制作打包的流程

  1. 获取 package.json 中的 version，修改自定义 nsis 脚本中的版本号为 version
  2. 编译主进程和渲染进程代码，然后启动 `electron-builder` 打包
  3. `win-unpacked` 生成成功，触发 `afterPack` 钩子函数，执行 `afterPack` 脚本，复制 `win-unpacked` 文件夹中的文件到 `FilesToInstall` 中，然后启动一个子进程，执行批处理脚本开始做自定义 nsis 打包
  4. 自定义 nsis 打包成功后，使用 hashFile 方法计算新的安装包的哈希值，并生成对应的 `latest.yml` 的文件

- 下面是 `beforePack.cjs`，作用是修改 nsis 中的版本号

  ```js
  const fs = require('fs');
  const path = require('path');

  function updateNsiVersion(nsiFilePath, newVersion, pkgVersion) {
    try {
      const fileContentBuffer = fs.readFileSync(nsiFilePath);
      let fileContent = fileContentBuffer.toString('utf16le');
      const versionRegex = /(!define PRODUCT_VERSION\s+)"[^"]+"/;
      const productVersionRegex = /(!define PRODUCT_SHOW_VERSION\s+)"[^"]+"/;
      const updatedContent = fileContent
        .replace(versionRegex, `$1"${newVersion}"`)
        .replace(productVersionRegex, `$1"${pkgVersion}"`);
      const contentBuffer = Buffer.from(updatedContent, 'utf16le');
      fs.writeFileSync(nsiFilePath, contentBuffer);
      console.log(
        `  • nsi version updated successfully! New version: ${newVersion}`
      );
    } catch (error) {
      console.error(`Failed to update version: ${error.message}`);
      process.exit(1);
    }
  }

  const packageJsonPath = path.join(__dirname, '../package.json');
  const packageInfo = require(packageJsonPath);
  const appName = packageInfo.name;
  const version = packageInfo.version;

  const nsiFile = path.resolve(
    __dirname,
    '../nsis_publish/SetupScripts/nim/nim_setup.nsi'
  );
  const targetVersion = `${version}.0`;
  console.log(`  • targetVersion ${targetVersion}`);

  updateNsiVersion(nsiFile, targetVersion, version);
  ```

- 下面是 `afterPack.cjs` 文件，用于 `afterPack` 钩子触发后启动子进程调起批处理脚本

  ```js
  const fsSync = require('fs');
  const path = require('path');
  const child = require('child_process');
  const fs = require('fs-extra');
  const afterAllArtifactBuild = require('./afterAllArtifactBuild.cjs');
  const {
    copyDirectory,
    moveToDirectory,
    getExeFilePaths,
    sortFilesByVersion,
  } = require('./utils.cjs');

  module.exports = async () => {
    const source = path.join(__dirname, '../out/win-unpacked');
    const dest = path.join(__dirname, '../nsis_publish/FilesToInstall');
    await copyDirectory(source, dest);
    console.log(`  • copy win-unpacked dir successful: ${source} -> ${dest}`);

    const out = fsSync.openSync(path.join(__dirname, '../out.log'), 'a');
    const err = fsSync.openSync(path.join(__dirname, '../out.log'), 'a');
    const batPath = path.join(__dirname, '../nsis_publish/build-nim.bat');

    const batDir = path.dirname(batPath);

    const ch = child.spawn(batPath, [], {
      detached: true,
      shell: true,
      stdio: ['ignore', out, err],
      cwd: batDir,
    });

    ch.on('exit', async code => {
      console.log(`  • child process exit，code: ${code}`);

      const dest = path.join(__dirname, '../out');
      const targetDir = path.join(__dirname, '../nsis_publish/Output/');
      const exefiles = await getExeFilePaths(targetDir);
      const sortfiles = sortFilesByVersion(exefiles, false);

      try {
        await moveToDirectory(sortfiles[0], dest);
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
        })();

        console.log('  • move final installer file successful');
        afterAllArtifactBuild();
      } catch (err) {
        console.log(`  • move final installer file error: ${err.message}`);
        throw err;
      }
    });

    ch.on('error', err => {
      console.error('  • child process failed:', err);
    });
  };
  ```

- 下面是 `afterAllArtifactBuild.cjs` 用于计算新安装包文件的哈希值并生成 `latest.yml` 文件

  ```js
  const { statSync, writeFileSync } = require('node:fs');
  const path = require('path');
  const { hashFile } = require('./utils.cjs');

  module.exports = async () => {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageInfo = require(packageJsonPath);
    const appName = packageInfo.name;
    const version = packageInfo.version;
    const installerName = `${appName}_V${version}.exe`;

    const installerPath = path.join(__dirname, `../out/${installerName}`);

    const hash = await hashFile(installerPath, undefined, undefined, {
      highWaterMark: 1024 * 1024 * 10,
    });

    const fileStats = statSync(installerPath);
    const fileSize = fileStats.size;

    const releaseDate = new Date().toISOString();

    const yamlContent = [
      `version: ${version}`,
      `files:`,
      `  - url: ${installerName}`,
      `    sha512: ${hash}`,
      `    size: ${fileSize}`,
      `path: ${installerName}`,
      `sha512: ${hash}`,
      `releaseDate: '${releaseDate}'`,
    ].join('\n');

    const ymlFilePath = path.join(__dirname, '../out/latest.yml');
    writeFileSync(ymlFilePath, yamlContent, 'utf8');

    console.log(`  • Successfully generated ${ymlFilePath}`);
    console.log(`  • Version: ${version}`);
    console.log(`  • Installer: ${installerName}`);
    console.log(`  • File size: ${fileSize} bytes`);
  };
  ```

- 至此，我们就解决了自定义 nsis 打包带来的全量升级失效的问题

## 参考链接

- [electron-updater DownloadedUpdateHelper.ts hashFile 方法所在的源码文件](https://github1s.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/DownloadedUpdateHelper.ts)
- [nodejs crypto.createHash(algorithm[, options])](https://nodejs.org/docs/latest/api/crypto.html#cryptocreatehashalgorithm-options)
