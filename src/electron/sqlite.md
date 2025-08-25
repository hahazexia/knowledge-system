# 集成 sqlite 数据库

- 桌面应用很多情况都要用到数据库来管理数据，这里使用嵌入式数据库 `sqlite`


| 核心优点           | 详细说明                                                                                                                                                               |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 轻量级，零配置      | 1. 嵌入式数据库，无需独立安装服务器进程，仅需一个动态库（.dll/.so）即可运行，随软件打包分发；<br>2. 数据库以单一文件（.db/.sqlite）存在，便于管理、备份和迁移（直接复制文件即可）。 |
| 跨平台兼容性       | 支持 Windows、macOS、Linux 等主流桌面系统，数据库文件格式在不同平台间通用，无跨系统数据兼容问题。                                                                           |
| 低资源占用         | 内存和 CPU 消耗极低，适合硬件配置有限的设备（如老旧电脑、嵌入式设备），不影响桌面软件运行性能。                                                                              |
| ACID 事务支持      | 具备完整的事务特性（原子性、一致性、隔离性、持久性），避免意外断电或崩溃导致的数据损坏，保障数据操作安全。                                                                     |
| 无需网络依赖       | 数据存储在本地，读写无需网络，适合离线使用场景，且本地访问速度远快于远程数据库。                                                                                           |
| 开源免费           | 遵循 Public Domain 协议，可免费用于商业软件，无需支付授权费用，显著降低开发成本。                                                                                          |
| 丰富的编程语言支持 | 兼容几乎所有主流编程语言（C/C++、Python、Java、C#、Node.js 等），均有成熟驱动，集成难度低。                                                                                     |

- ndoejs 的 [sqlite3](https://www.npmjs.com/package/sqlite3) 这个包已经渐渐不维护了，所以这里选用 [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) 这个包

## 安装和编译

- 首先安装 `better-sqlite3`
  ```bash
    npm i better-sqlite3
  ```

- 这里需要注意 `better-sqlite3` 是 `C/C++` 编写的原生 `Node` 模块，而 `Electron` 虽基于 `Node.js`，但使用独立的 `V8` 引擎和 `Node.js` 二进制接口（ABI），与系统 `Node` 环境不兼容，直接安装的 `better-sqlite3` 是针对系统 `Node` 编译的，无法在 `Electron` 中运行，会发生下面的错误信息：
  ```bash
    [2025-08-25 11:41:44.059] [error] {
    errorSummary: 'db initialize failed',
    message: "The module '\\\\?\\D:\\project\\work\\electron-build-update-demo\\node_modules\\sqlite\\build\\Release\\better_sqlite3.node'\n" +
      'was compiled against a different Node.js version using\n' +
      'NODE_MODULE_VERSION 127. This version of Node.js requires\n' +
      'NODE_MODULE_VERSION 136. Please try re-compiling or re-installing\n' +
      'the module (for instance, using `npm rebuild` or `npm install`).',
    code: 'ERR_DLOPEN_FAILED',
    stack: "Error: The module '\\\\?\\D:\\project\\work\\electron-build-update-demo\\node_modules\\sqlite\\build\\Release\\better_sqlite3.node'\n" +
      'was compiled against a different Node.js version using\n' +
      'NODE_MODULE_VERSION 127. This version of Node.js requires\n' +
      'NODE_MODULE_VERSION 136. Please try re-compiling or re-installing\n' +
      'the module (for instance, using `npm rebuild` or `npm install`).\n' +
      '    at process.func [as dlopen] (node:electron/js2c/node_init:2:2617)\n' +
      '    at Module._extensions..node (node:internal/modules/cjs/loader:1930:18)\n' +
      '    at Object.func [as .node] (node:electron/js2c/node_init:2:2617)\n' +
      '    at Module.load (node:internal/modules/cjs/loader:1472:32)\n' +
      '    at Module._load (node:internal/modules/cjs/loader:1289:12)\n' +
      '    at c._load (node:electron/js2c/node_init:2:18013)\n' +
      '    at TracingChannel.traceSync (node:diagnostics_channel:322:14)\n' +
      '    at wrapModuleLoad (node:internal/modules/cjs/loader:242:24)\n' +
      '    at Module.require (node:internal/modules/cjs/loader:1494:12)\n' +
      '    at require (node:internal/modules/helpers:135:16)'
  ```
  所以需要在 `package.json` 中加入 `"rebuild": "electron-rebuild -f -w better-sqlite3"` 这条命令，用 [@electron/rebuild](https://www.npmjs.com/package/@electron/rebuild) 工具，针对当前 `Electron` 版本重新编译 `better-sqlite3`，使其适配 `Electron` 运行时；其中 `-f` 强制重建，`-w better-sqlite3` 指定仅编译该模块，最终解决原生模块的兼容性问题

## DB 类和 orm 工具类

- 本来想去集成类似 [typrorm](https://www.npmjs.com/package/typeorm) 的 orm 工具库，但是最后决定自己实现 orm 类，因为像 `typeorm` 这样的库，兼容基本上所有常用数据库，并且它很难通过打包工具整体编译输出到最终一个 js 文件中，因为模块系统不兼容的问题，这样体积庞大的包会导致 asar 包变得非常大，之前测试包含了 `typeorm` 的 asar 包体积增到到了 27mb，因此放弃集成第三方的 orm，转而自己实现

- 首先先封装 DB 数据库类
  ```ts
    import sqlite from 'better-sqlite3';
    import { ConfigModel } from './entities/config.js';
    import { app } from 'electron';
    import path from 'node:path';
    import fs from 'node:fs';
    import { logErrorInfo } from './utils.js';
    import { ModelInstance } from './orm.js';

    type TableMap = {
      configs: ModelInstance<any>;
    };

    export class DB {
      dbPath: string; // 数据库文件地址
      db: sqlite.Database; // 数据库对象
      tables: Map<keyof TableMap, ModelInstance<any>> = new Map(); // Map 存储表对象

      constructor(options: sqlite.Options) {
        const dbPath = this.getDatabasePath();
        const db = new sqlite(dbPath, { verbose: console.log, ...options });
        this.db = db;
        this.dbPath = dbPath;
      }

      // 初始化表
      init(models: ModelInstance<any>[]) {
        models.forEach((instance: ModelInstance<any>) => {
          instance.createTable();
          this.tables.set(instance.table as keyof TableMap, instance);
        });
      }
      
      // 获取表对象
      getTable<K extends keyof TableMap>(name: K): ModelInstance<any> {
        return this.tables.get(name) as ModelInstance<any>;
      }

      // 获取数据库文件地址
      getDatabasePath(): string {
        if (this.dbPath) {
          return this.dbPath;
        }
        const userDataPath = app.getPath('userData');
        const dbDir = path.join(userDataPath, 'database');

        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }

        const dbPath = path.join(dbDir, 'app.db');
        log.info(`dbPath: ${dbPath}`);

        return dbPath;
      }
    }


    let alreadyInitialized = false;

    export function initializeDatabase(): null | DB {
      if (alreadyInitialized) {
        return global.db;
      }
      let db: DB;
      try {
        // 初始化数据库和表
        db = new DB({ verbose: global.log.info });
        db.init([new ConfigModel(db.db)]);
      } catch (err) {
        logErrorInfo('db initialize failed', err);
        return null;
      }
      log.info(`db initialize successful`);
      global.db = db;
      alreadyInitialized = true;

      return db;
    }

  ```

- 然后再封装 orm 类
  ```ts
    import sqlite from 'better-sqlite3';

    /**
    * 支持的SQLite字段类型
    * 映射SQLite原生数据类型，boolean类型在SQLite中实际存储为INTEGER(0/1)
    */
    type FieldType = 'integer' | 'text' | 'real' | 'boolean' | 'blob' | string;

    /**
    * 表字段配置选项接口
    * 定义单个字段的类型和约束条件
    */
    interface FieldOptions {
      type: FieldType;          // 字段数据类型
      primary?: boolean;        // 是否为主键（默认false）
      autoincrement?: boolean;  // 是否自增（仅主键有效，默认false）
      notNull?: boolean;        // 是否非空（默认false）
      unique?: boolean;         // 值是否唯一（默认false）
      default?: any;            // 默认值，支持普通值或SQL函数({ raw: "SQL语句" })
    }

    /**
    * 表结构定义类型
    * 键为字段名，值为对应的字段配置
    */
    type Schema = Record<string, FieldOptions>;

    /**
    * Upsert操作配置选项
    * 用于处理插入冲突时的更新逻辑
    */
    interface UpsertOptions {
      conflictPaths: string[];  // 用于判断冲突的字段数组
      skipUpdateIfNoValuesChanged: boolean; // 无更新内容时是否跳过操作
    }

    /**
    * 从表结构中提取可插入/更新的数据类型
    * 自动排除自增字段，根据字段类型映射对应的TypeScript类型
    */
    export type ExtractData<T extends Schema> = {
      [K in keyof T as T[K]['autoincrement'] extends true
      ? never
      : K]: T[K]['type'] extends 'integer'
      ? number
      : T[K]['type'] extends 'text'
      ? string
      : T[K]['type'] extends 'real'
      ? number
      : T[K]['type'] extends 'boolean'
      ? boolean
      : any;
    };

    /**
    * 包含自增ID的数据类型
    * 所有查询和插入操作的返回结果都会包含id字段
    */
    export type DataWithId<T> = T & { id: number };

    /**
    * ORM模型接口定义
    * 规范所有数据表模型需要实现的核心方法
    */
    export type ModelInstance<T extends Schema> = {
      readonly db: sqlite.Database;  // 数据库实例（只读）
      table: string;                 // 表名
      schema: Schema;                // 表结构定义
      
      createTable(): void;                                   // 创建数据表
      insert(data: ExtractData<T>): DataWithId<ExtractData<T>>; // 插入数据
      upsert(data: ExtractData<T>, options: UpsertOptions): DataWithId<ExtractData<T>>; // 插入或更新
      update(id: number, data: Partial<ExtractData<T>>): boolean; // 更新数据
      findOneBy(data: Partial<ExtractData<T>>): DataWithId<ExtractData<T>> | null; // 按条件查询单条
      findAll(): DataWithId<ExtractData<T>>[]; // 查询所有数据
      deleteOneBy(data: Partial<ExtractData<T>>): boolean; // 按条件删除单条
      deleteAll(): number; // 删除所有数据
      findExistingByConflictPaths(data: ExtractData<T>, conflictPaths: string[]): DataWithId<ExtractData<T>> | null; // 按冲突字段查询
    };

    /**
    * SQLite ORM抽象基类
    * 实现了ModelInstance接口的通用方法，子类只需定义表名和表结构即可使用
    */
    export abstract class TableModel<T extends Schema> implements ModelInstance<T> {
      abstract table: string;  // 表名（子类必须定义）
      abstract schema: Schema; // 表结构（子类必须定义）
      public db: sqlite.Database; // 数据库实例

      /**
      * 构造函数
      * @param db - better-sqlite3数据库实例
      */
      constructor(db: sqlite.Database) {
        this.db = db;
      }

      /**
      * 创建数据表
      * 根据schema自动生成CREATE TABLE语句，表不存在时创建
      * @throws 当表名或表结构未定义时抛出错误
      */
      createTable(): void {
        const schema = this.schema;
        const table = this.table;
        
        if (!schema || !table)
          throw new Error('createTable: Schema or table name not defined');

        const fields: string[] = [];
        for (const [fieldName, options] of Object.entries(schema)) {
          const parts: string[] = [
            fieldName,
            // SQLite没有boolean类型，自动转换为INTEGER
            options.type === 'boolean' ? 'INTEGER' : options.type.toUpperCase(),
          ];

          // 添加字段约束
          if (options.primary) parts.push('PRIMARY KEY');
          if (options.autoincrement) parts.push('AUTOINCREMENT');
          if (options.notNull) parts.push('NOT NULL');
          if (options.unique) parts.push('UNIQUE');

          // 处理默认值
          if (options.default !== undefined) {
            let defaultValue;
            if (typeof options.default === 'object' && 'raw' in options.default) {
              // 支持SQL原生函数，如DATETIME('now')
              defaultValue = `(${options.default.raw})`;
            } else {
              // 普通值处理，字符串添加引号
              defaultValue = typeof options.default === 'string'
                ? `'${options.default}'`
                : options.default;
            }
            parts.push(`DEFAULT ${defaultValue}`);
          }

          fields.push(parts.join(' '));
        }

        // 生成并执行建表SQL
        const sql = `CREATE TABLE IF NOT EXISTS ${table} (
          ${fields.join(',\n  ')}
        )`;
        this.db.prepare(sql).run();
      }

      /**
      * 插入数据
      * @param data - 符合表结构的待插入数据（不含自增字段）
      * @returns 插入后的数据（包含自增id）
      */
      insert(data: ExtractData<T>): DataWithId<ExtractData<T>> {
        const fields = Object.keys(data) as (keyof ExtractData<T>)[];
        const placeholders = fields.map(field => `@${String(field)}`);

        const sql = `INSERT INTO ${this.table} (${fields.join(',')})
                    VALUES (${placeholders.join(',')})`;
        const result = this.db.prepare(sql).run(data);

        return { ...data, id: result.lastInsertRowid as number };
      }

      /**
      * 插入或更新数据（Upsert）
      * 当冲突字段存在重复值时执行更新，否则执行插入
      * @param data - 待插入/更新的数据
      * @param options - Upsert配置选项
      * @returns 操作后的完整数据
      * @throws 当冲突字段不存在于表结构中时抛出错误
      */
      upsert(
        data: ExtractData<T>,
        options: UpsertOptions
      ): DataWithId<ExtractData<T>> {
        // 验证冲突字段有效性
        options.conflictPaths.forEach(path => {
          if (!Object.keys(this.schema).includes(path)) {
            throw new Error(`upsert: Conflict path "${path}" does not exist in schema`);
          }
        });

        const insertFields = Object.keys(data) as (keyof ExtractData<T>)[];
        const insertPlaceholders = insertFields.map(field => `@${String(field)}`);
        const conflictClause = `ON CONFLICT(${options.conflictPaths.join(',')})`;

        // 筛选需要更新的字段（排除冲突字段）
        const updateFields = insertFields.filter(
          field => !options.conflictPaths.includes(String(field))
        );

        // 无更新内容且配置了跳过选项时的处理
        if (options.skipUpdateIfNoValuesChanged && updateFields.length === 0) {
          const existing = this.findExistingByConflictPaths(data, options.conflictPaths);
          return existing ? existing : this.insert(data);
        }

        // 生成更新语句，自动更新update_at字段
        const updateAssignments = [
          ...updateFields.map(
            field => `${String(field)} = EXCLUDED.${String(field)}`
          ),
          "update_at = DATETIME('now', 'localtime')",
        ];

        // 执行Upsert操作并返回结果
        const sql = `
          INSERT INTO ${this.table} (${insertFields.join(',')})
          VALUES (${insertPlaceholders.join(',')})
          ${conflictClause} DO UPDATE SET
            ${updateAssignments.join(',')}
          RETURNING *
        `;

        const result = this.db.prepare(sql).get(data) as DataWithId<ExtractData<T>>;
        return result;
      }

      /**
      * 根据冲突字段查询已有数据
      * 用于Upsert操作前判断数据是否已存在
      * @param data - 待查询的数据
      * @param conflictPaths - 冲突字段数组
      * @returns 存在则返回数据，否则返回null
      */
      findExistingByConflictPaths(
        data: ExtractData<T>,
        conflictPaths: string[]
      ): DataWithId<ExtractData<T>> | null {
        const whereClauses = conflictPaths.map(path => `${path} = @${path}`);
        const sql = `
          SELECT * FROM ${this.table}
          WHERE ${whereClauses.join(' AND ')}
        `;

        const queryData = conflictPaths.reduce((obj, path) => {
          obj[path] = (data as Record<string, any>)[path];
          return obj;
        }, {} as Record<string, any>);

        return this.db.prepare(sql).get(queryData) as DataWithId<ExtractData<T>> | null;
      }

      /**
      * 根据ID更新数据
      * @param id - 要更新的数据ID
      * @param data - 待更新的字段（部分字段）
      * @returns 更新是否成功（是否有数据被修改）
      */
      update(id: number, data: Partial<ExtractData<T>>): boolean {
        // 自动添加更新时间
        const updateData = {
          ...data,
          update_at: { raw: "DATETIME('now', 'localtime')" },
        };

        if (Object.keys(updateData).length === 0) return false;

        // 生成更新语句，支持SQL原生函数
        const updates = Object.entries(updateData).map(([key, value]) => {
          if (typeof value === 'object' && 'raw' in value) {
            return `${key} = ${value.raw}`;
          }
          return `${key} = @${key}`;
        });

        const sql = `UPDATE ${this.table} SET ${updates.join(',')} WHERE id = @id`;

        // 整理参数，排除SQL原生函数值
        const params = Object.entries(updateData).reduce(
          (obj, [key, value]) => {
            if (!(typeof value === 'object' && 'raw' in value)) {
              obj[key] = value;
            }
            return obj;
          },
          { id } as Record<string, any>
        );

        return this.db.prepare(sql).run(params).changes > 0;
      }

      /**
      * 按条件查询单条数据
      * @param data - 查询条件（字段键值对）
      * @returns 查询到的数据或null
      * @throws 当查询条件为空或包含不存在的字段时抛出错误
      */
      findOneBy(data: Partial<ExtractData<T>>): DataWithId<ExtractData<T>> | null {
        const entries = Object.entries(data);
        if (entries.length === 0) {
          throw new Error('findOneBy: query conditions cannot be null');
        }

        // 验证查询字段有效性
        entries.forEach(([key]) => {
          if (!Object.keys(this.schema).includes(key)) {
            throw new Error(`findOneBy: ${key} doesn't exist in table ${this.table}`);
          }
        });

        const whereClauses = entries.map(([key]) => `${key} = @${key}`);
        const whereSql = whereClauses.join(' AND ');

        const sql = `
          SELECT * FROM ${this.table}
          WHERE ${whereSql}
          LIMIT 1
        `;

        const result = this.db.prepare(sql).get(data) as DataWithId<ExtractData<T>> | undefined;
        return result || null;
      }

      /**
      * 查询表中所有数据
      * @returns 所有数据的数组
      */
      findAll(): DataWithId<ExtractData<T>>[] {
        const sql = `SELECT * FROM ${this.table}`;
        return this.db.prepare(sql).all() as DataWithId<ExtractData<T>>[];
      }

      /**
      * 按条件删除单条数据
      * @param data - 删除条件（字段键值对）
      * @returns 删除是否成功（是否有数据被删除）
      * @throws 当删除条件为空或包含不存在的字段时抛出错误
      */
      deleteOneBy(data: Partial<ExtractData<T>>): boolean {
        const entries = Object.entries(data);
        if (entries.length === 0) {
          throw new Error('deleteOneBy: query conditions cannot be null');
        }

        // 验证删除字段有效性
        entries.forEach(([key]) => {
          if (!Object.keys(this.schema).includes(key)) {
            throw new Error(`deleteOneBy: ${key} doesn't exist in table ${this.table}`);
          }
        });

        const whereClauses = entries.map(([key]) => `${key} = @${key}`);
        const whereSql = whereClauses.join(' AND ');

        const sql = `
          DELETE FROM ${this.table}
          WHERE ${whereSql}
          LIMIT 1
        `;

        return this.db.prepare(sql).run(data).changes > 0;
      }

      /**
      * 删除表中所有数据
      * @returns 删除的记录数量
      */
      deleteAll(): number {
        const sql = `DELETE FROM ${this.table}`;
        const result = this.db.prepare(sql).run();
        return result.changes;
      }
    }
  ```