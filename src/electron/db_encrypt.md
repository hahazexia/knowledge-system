# 数据库加密

- 数据库中如果存储敏感数据，不希望数据被窃取，则需要对数据库文件加密。这里想到的方案是修改 `better-sqlite3-multiple-ciphers` 的源码，编译自定义的 sqlite3 数据库以支持 AES 解密流程
  - 拉取 `better-sqlite3-multiple-ciphers` 源码
  - 生成 AES 秘钥（32 字节，64 位十六进制字符串），然后将其转换成字节数组，硬编码到数据库源码 C++ 代码中
  - 修改数据库源码 `JS_exec` 方法，此方法用于执行 sql 语句，增加劫持 `PRAGMA key='xxx'` 和 `PRAGMA rekey='xxx'` 的逻辑，使用之前硬编码的秘钥将 key 和 rekey 解密，得到密码原文，然后再传递给 sqlite 作为 db 文件的密码
  - 编译修改好的数据库生成 .node 原生模块，之后使用时 `this.db.exec("PRAGMA key='xxx'")` exec 传递的 PRAGMA 语句都会被劫持然后走解密流程，可以使用 `SQLiteStudio` 软件打开加密的数据库，选择数据库类型为 `WxSQLite3`，密码类型为 `sqleet: ChaCha20-Poly1305`，然后输入明文密码即可打开数据库文件

```mermaid
flowchart TD
A[先生成32字节随机秘钥,硬编码（需拆分成十六进制字符数组）到数据库交互层中] --> B[交互层中修改数据库交互层的JS_exec方法，添加解密逻辑，根据硬编码秘钥解密传入的加密字符串，获取到密码然后再传递给sqlite]
B --> C[使用AES-256-CBC加密算法将密码明文加密（使用第一步生成的秘钥）]
C --> D[加密好的字符串从electron主进程传入给数据库DB对象（exec方法sql语句形式）]
D --> E[JS_exec接收到加密字符串，进行AES解密得到密码明文]
E --> F[sqlite数据库使用密码明文来加密.db文件]
F --> G[开发环境使用明文来解密查看.db数据库文件内容]

H[AES-256-CBC加密流程] --> H1[生成使用 32 字节随机密钥]
H1 --> H2[生成 16 字节随机IV]
H2 --> H3[根据 IV 和 秘钥实例化加密器]
H3 --> H4[通过 update 处理大部分明文，final 处理最后一块并完成填充，拼接得到完整密文]
H4 --> H5[将 16 字节 IV 与密文拼接，作为最终加密结果]
```

## better-sqlite3-multiple-ciphers

- `better-sqlite3-multiple-ciphers` 是增加了加密功能的 `better-sqlite3`，使用了 `SQLite3MultipleCiphers` 以支持多种加密算法
- 只需要安装 `better-sqlite3-multiple-ciphers` 然后在代码里这样写就可以加密数据库文件了
  ```ts
  import Database from 'better-sqlite3-multiple-ciphers';
  const db = new Database('foobar.db', options);
  db.pragma(`key='secret-key'`);
  ```
- 这里的 key 的值就是密码明文，而我这里想要做的事情就是来劫持 `better-sqlite3-multiple-ciphers` 的接口，然后我们可以传入加密后的字符串，然后在 c++ 代码中解密之后再拿到明文密码传递给 sqlite
- 经过试验，最后成功修改了 db.exec 方法，可以实现解密 PRAGMA key 语句和 PRAGMA rekey 传递的加密字符串

## 实现

- 首先复制一份 `better-sqlite3-multiple-ciphers` 源码到项目中，根目录下新增一个 js 文件用来生成 AES 加密所需要的 key 和明文密码加密之后的密文。可以使用 `crypto.randomBytes(32).toString('hex')` 这一句生成随机字符串作为加密 key，之后脚本会将 key 转换成字节数组

  ```js
  const crypto = require('crypto');
  const { Buffer } = require('node:buffer');

  // 生成一段随机字符串
  console.log(crypto.randomBytes(32).toString('hex'));

  /**
      确定加密参数：使用 32 字节密钥（64 个 16 进制字符），采用 CBC 模式和默认填充方式，解密需完全一致。
      生成 IV：生成 16 字节随机初始化向量，用于增强 CBC 模式加密的安全性。
      处理明文：将 UTF-8 编码的明文转为二进制，自动填充至 16 字节整数倍。
      初始化加密器：基于 AES-256-CBC 算法、密钥和 IV 创建加密器实例。
      分块加密：通过 update 处理大部分明文，final 处理最后一块并完成填充，拼接得到完整密文。
      输出结果：将 16 字节 IV 与密文拼接，作为最终加密结果供传输或存储。
    */
  /**
   * AES-256-CBC 加密
   * @param {string} plaintext 明文
   * @param {string} keyHex 16进制格式的32字节密钥
   * @returns {Buffer} 加密结果（格式：IV(16字节) + 密文(n*16字节)）
   */
  function aesEncrypt(plaintext, keyHex) {
    // 生成随机IV（16字节）
    const iv = crypto.randomBytes(16);
    // 将16进制密钥转换为Buffer
    const key = Buffer.from(keyHex, 'hex');

    // 验证密钥长度
    if (key.length !== 32) {
      throw new Error('密钥必须是32字节（64个16进制字符）');
    }

    // 创建加密器
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    // 加密（输出Buffer）
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // 返回：IV + 密文（方便C++端直接解析）
    return Buffer.concat([iv, encrypted]);
  }

  // 生成 32 字节的 64 位随机秘钥，16 进制字符串形式
  // const key = crypto.randomBytes(32).toString('hex');
  // 使用示例
  // 假设密钥与binding.gyp中的AES_256_KEY一致
  const keyHex =
    'c65a4bce6b4aec28fd06c12c37fddac0907a579e3b59dfa90197b043fd87cc07';

  // 明文
  const plaintext = 'my_secret_code';

  // 加密（返回包含IV和密文的Buffer）
  const encryptedBuffer = aesEncrypt(plaintext, keyHex);

  console.log('加密后总长度:', encryptedBuffer.length, '字节'); // 16(IV) + 16(密文) = 32字节
  console.log('IV(前16字节):', encryptedBuffer.slice(0, 16).toString('hex'));
  console.log('密文(剩余部分):', encryptedBuffer.slice(16).toString('hex'));
  console.log('完整加密数据:', encryptedBuffer.toString('hex'));

  // convert-key.js
  const fs = require('fs');

  // 补全可能的奇数长度（确保每2位一组）
  const paddedHex = keyHex.length % 2 === 1 ? `0${keyHex}` : keyHex;

  // 按2位分割并转换为0x前缀的字节
  const byteArray = [];
  for (let i = 0; i < paddedHex.length; i += 2) {
    const byte = paddedHex.slice(i, i + 2);
    byteArray.push(`0x${byte}`);
  }

  // 生成C++代码格式
  const cCode = `const unsigned char source_key[${
    byteArray.length
  }] = {\n  ${byteArray.join(', ')}\n};`;

  // 写入文件（如key.h，供C++代码include）
  fs.writeFileSync('./src/key.h', cCode);
  console.log('转换完成，密钥已写入src/key.h');
  ```

- 在入口文件 `better_sqlite3.lzz` 新增一行引入刚才生成的 key

  ```c++
  #include "key.h"
  ```

  - 入口文件 `better_sqlite3.lzz` 引入使用到的头文件，并且修改 `binding.gyp` 配置文件，因为 AES 的解密会用到 openssl，需要引入 openssl 的头文件，因此需要在系统上安装 openssl，windows 的版本在这里下载 [https://slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html)

  ```c++
  #include <openssl/aes.h>
  #include <openssl/rand.h>
  #include <fstream>
  #include <ctime>
  #include <cstdarg>
  #include <string.h>
  ```

  ```json
  {
    "include_dirs": ["C:/OpenSSL-Win64/include"],
    "library_dirs": ["C:/OpenSSL-Win64/lib/VC/x64/MD"],
    "libraries": ["libcrypto.lib"]
  }
  ```

- 修改数据库方法定义文件 `src\objects\database.lzz`，篡改 `JS_exec` 方法，使其拦截 PRAGMA 传递的 key 和 rekey，然后对加密字符串进行解密

  ```c++
  #define AES_BLOCK_SIZE 16
  #define AES_256_KEY_LEN 32

  static bool hex_to_bin(const char *hex_str, unsigned char *bin_buf, size_t bin_len)
  {
    // 检查 hex 字符串长度是否符合预期（2个字符对应1个字节）
    if (strlen(hex_str) != 2 * bin_len)
    {
      return false; // hex 长度与目标二进制长度不匹配
    }

    // 逐个字符转换
    for (size_t i = 0; i < bin_len; ++i)
    {
      // 取两个 hex 字符（如 "a1"）
      char hex_byte[3] = {hex_str[2 * i], hex_str[2 * i + 1], '\0'};

      // 转换为 0-255 的整数
      unsigned char bin_byte = static_cast<unsigned char>(strtol(hex_byte, nullptr, 16));

      // 存储到二进制缓冲区
      bin_buf[i] = bin_byte;
    }
    return true;
  }

  // 辅助函数：AES-256-CBC解密（带PKCS#7填充去除）
  static bool aes256_cbc_decrypt(const unsigned char *key, const unsigned char *iv,
                                const unsigned char *ciphertext, size_t ciphertext_len,
                                unsigned char *plaintext, size_t *plaintext_len)
  {
    AES_KEY aes_key;
    if (AES_set_decrypt_key(key, 256, &aes_key) != 0)
    {
      return false;
    }

    *plaintext_len = ciphertext_len;
    AES_cbc_encrypt(ciphertext, plaintext, ciphertext_len, &aes_key,
                    const_cast<unsigned char *>(iv), AES_DECRYPT);

    // 去除PKCS#7填充
    unsigned char pad = plaintext[*plaintext_len - 1];
    if (pad == 0 || pad > *plaintext_len)
    {
      return false;
    }

    for (size_t i = 0; i < pad; ++i)
    {
      if (plaintext[*plaintext_len - 1 - i] != pad)
      {
        return false;
      }
    }


    *plaintext_len -= pad;
    return true;
  }

  NODE_METHOD(JS_exec)
  {
    Database *db = Unwrap<Database>(info.This());
    REQUIRE_ARGUMENT_STRING(first, v8::Local<v8::String> source);
    REQUIRE_DATABASE_OPEN(db);
    REQUIRE_DATABASE_NOT_BUSY(db);
    REQUIRE_DATABASE_NO_ITERATORS_UNLESS_UNSAFE(db);
    db->busy = true;

    UseIsolate;
    // 初始化为原始source，后续可能会被替换
    v8::Local<v8::String> modifiedSource = source;
    std::string sqlStr;

    // 1. 把 V8 字符串转 C++ 字符串，用于解析
    v8::String::Utf8Value sourceUtf8(isolate, source);
    sqlStr = *sourceUtf8;

    // 2. 转为小写，不区分大小写匹配 PRAGMA
    std::string sqlLower = sqlStr;
    std::transform(sqlLower.begin(), sqlLower.end(), sqlLower.begin(), ::tolower);

    // 3. 查找 PRAGMA key= 或 rekey=，提取加密 hex
    size_t keyPos = sqlLower.find("pragma") != std::string::npos
                        ? sqlLower.find("key=")
                        : std::string::npos;
    size_t rekeyPos = sqlLower.find("pragma") != std::string::npos
                          ? sqlLower.find("rekey=")
                          : std::string::npos;

    std::string encryptedHex;
    std::string pragmaType;

    // 修正提取加密hex的逻辑
    auto extractEncryptedHex = [&](size_t startIdx, const std::string &type)
    {
      pragmaType = type;

      // 正确计算"pragma key="或"pragma rekey="的长度（包括空格）
      // "pragma key=" 是 "pragma" + " " + "key=" → 6 + 1 + 4 = 11 个字符
      // "pragma rekey=" 是 "pragma" + " " + "rekey=" → 6 + 1 + 6 = 13 个字符
      size_t pragmaKeywordLength = (type == "key") ? 11 : 13;

      // 计算值的起始位置（跳过整个"pragma key="部分）
      size_t valStart = startIdx + (startIdx > pragmaKeywordLength ? 0 : pragmaKeywordLength);

      // 检查是否超出字符串长度
      if (valStart >= sqlStr.length())
      {
        return;
      }

      // 跳过值前面的空格和制表符
      size_t pos = sqlStr.find_first_not_of(" \t", valStart);
      if (pos == std::string::npos)
      {
        return;
      }

      // 处理引号包裹（单/双引号）
      char quote = '\0';
      if (sqlStr[pos] == '"' || sqlStr[pos] == '\'')
      {
        quote = sqlStr[pos];
        pos++;
      }

      // 找值的结束位置（引号/分号/空格）
      size_t endPos;
      if (quote != '\0')
      {
        endPos = sqlStr.find(quote, pos);
      }
      else
      {
        endPos = sqlStr.find_first_of("; \t", pos);
      }

      // 如果没找到结束符，就取到字符串末尾
      if (endPos == std::string::npos)
      {
        endPos = sqlStr.length();
      }

      // 提取hex字符串
      encryptedHex = sqlStr.substr(pos, endPos - pos);

      // 验证hex字符串（暂时添加日志查看验证过程）
      for (unsigned char c : encryptedHex)
      {
        if (!isxdigit(c))
        {
          encryptedHex.clear();
          break;
        }
      }
    };

    // 修正匹配逻辑 - 直接使用找到的keyPos
    if (keyPos != std::string::npos)
    {
      // 对于"pragma key="，keyPos是"key="中"k"的位置索引
      extractEncryptedHex(0, "key"); // 从字符串开始处计算
    }
    else if (rekeyPos != std::string::npos)
    {
      extractEncryptedHex(0, "rekey");
    }

    // 4. 解密逻辑（仅当提取到有效 hex 时执行）
    if (!encryptedHex.empty() && !pragmaType.empty())
    {
      // 验证 hex 长度（16字节IV + 密文 → 至少32字符，且为偶数）
      if (encryptedHex.length() < 32 || encryptedHex.length() % 2 != 0)
      {
        db->busy = false; // 恢复状态
        isolate->ThrowException(v8::Exception::TypeError(
            v8::String::NewFromUtf8(isolate, "Invalid encrypted hex length (≥32, even)").ToLocalChecked()));
        return;
      }

      // hex 转二进制
      size_t binLen = encryptedHex.length() / 2;
      unsigned char *encryptedBin = new unsigned char[binLen];
      if (!hex_to_bin(encryptedHex.c_str(), encryptedBin, binLen))
      {
        delete[] encryptedBin;
        db->busy = false; // 恢复状态
        isolate->ThrowException(v8::Exception::TypeError(
            v8::String::NewFromUtf8(isolate, "Invalid hex format").ToLocalChecked()));
        return;
      }

      // 提取 IV（前16字节）和密文
      unsigned char iv[AES_BLOCK_SIZE] = {0};
      if (binLen < AES_BLOCK_SIZE)
      {
        delete[] encryptedBin;
        db->busy = false; // 恢复状态
        isolate->ThrowException(v8::Exception::TypeError(
            v8::String::NewFromUtf8(isolate, "Encrypted data too short").ToLocalChecked()));
        return;
      }
      memcpy(iv, encryptedBin, AES_BLOCK_SIZE);
      const unsigned char *ciphertext = encryptedBin + AES_BLOCK_SIZE;
      size_t ciphertextLen = binLen - AES_BLOCK_SIZE;

      // 全局 AES 密钥转二进制（AES_256_KEY 为 64 字符 hex）
      const unsigned char aesKey[32] = {};

      memcpy(const_cast<unsigned char *>(aesKey), source_key, sizeof(aesKey));

      // AES-256-CBC 解密
      unsigned char *plaintext = new unsigned char[ciphertextLen + AES_BLOCK_SIZE];
      size_t plaintextLen = 0;
      bool decryptOk = aes256_cbc_decrypt(
          aesKey, iv, ciphertext, ciphertextLen, plaintext, &plaintextLen);

      if (!decryptOk || plaintextLen == 0)
      {
        delete[] encryptedBin;
        delete[] plaintext;
        db->busy = false; // 恢复状态
        isolate->ThrowException(v8::Exception::TypeError(
            v8::String::NewFromUtf8(isolate, "AES decryption failed").ToLocalChecked()));
        return;
      }

      // 构造解密后的 PRAGMA 语句
      std::string plaintextStr(reinterpret_cast<char *>(plaintext), plaintextLen);
      std::string newPragma = "PRAGMA " + pragmaType + "='" + plaintextStr + "'";

      // 转为 V8 字符串，替换原 source
      modifiedSource = v8::String::NewFromUtf8(isolate, newPragma.c_str()).ToLocalChecked();

      // 清理内存
      delete[] encryptedBin;
      delete[] plaintext;
    }

    // 使用处理后的modifiedSource创建C风格字符串
    v8::String::Utf8Value utf8(isolate, modifiedSource);
    const char *sql = *utf8;
    const char *tail;

    int status;
    const bool has_logger = db->has_logger;
    sqlite3 *const db_handle = db->db_handle;
    sqlite3_stmt *handle;

    // 是否当前不是 pragma key
    const bool has_no_pragma_key = keyPos == std::string::npos;

    for (;;)
    {
      while (IS_SKIPPED(*sql))
        ++sql;
      status = sqlite3_prepare_v2(db_handle, sql, -1, &handle, &tail);
      sql = tail;
      if (!handle)
        break;
      if (has_no_pragma_key && has_logger && db->Log(isolate, handle))
      {
        sqlite3_finalize(handle);
        status = -1;
        break;
      }
      do
        status = sqlite3_step(handle);
      while (status == SQLITE_ROW);
      status = sqlite3_finalize(handle);
      if (status != SQLITE_OK)
        break;
    }

    db->busy = false;
    if (status != SQLITE_OK)
    {
      db->ThrowDatabaseError();
    }
  }
  ```

- 这个版本的 [better-sqlite3-multiple-ciphers 12.2.0](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) 还在使用 `lazy c++` 语法，所以需要 `lazy c++` 命令行工具用来编译 `.lzz` 文件，在 [https://github.com/driedfruit/lzz/releases](https://github.com/driedfruit/lzz/releases) 下载 `lzz `工具，然后将 `lzz.exe` 放入 `better-sqlite3-multiple-ciphers` 根目录

- 然后运行下面的 npm 命令就可以重新编译 lzz 代码为 c++ 代码并且调用 node-gyp 编译为 nodejs 模块，最后就可以在 build 目录中看到编译的结果，其中包含 .node 文件就是我们需要的数据库原生模块

  ```
    "rebuild-release": "npm run lzz && npm run build-release"
  ```

- 最后在我们的项目中需要加这样一个命令，用于重新编译原生模块。这里需要注意的是 `--build-from-source` 参数，这个必须加上，否则 `@electron-rebuild` 重新编译的时候就会读取缓存不会重新从源码编译

  ```json
  {
    "rebuild:sqlite": "electron-rebuild --version 37.2.4 --module-dir ./src/main/better-sqlite3-multiple-ciphers -f --build-from-source && copyfiles -u 5 ./src/main/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node ./Release"
  }
  ```

## 参考链接

- [better-sqlite3-multiple-ciphers](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers)
