# 数据库加密

- 数据库中如果存储敏感数据，不希望数据被窃取，则需要对数据库文件加密。这里想到的方案是修改 `better-sqlite3-multiple-ciphers` 的源码，编译自定义的 sqlite3 数据库以支持 AES 解密流程
  - 拉取 `better-sqlite3-multiple-ciphers` 源码
  - 生成 AES 秘钥（32字节，64位十六进制字符串），然后将其转换成字节数组，硬编码到数据库源码 C++ 代码中
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

## 参考链接

- [better-sqlite3-multiple-ciphers](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers)