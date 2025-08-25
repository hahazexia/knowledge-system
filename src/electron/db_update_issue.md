# 数据库升级问题

- 引入了数据库，就难免发生数据库的结构升级，比如字段的新增，这时候就需要实现数据库的升级逻辑

  - 首先添加一张 `db_version` 表，用来存下当前数据库的版本号
  - 把升级的 sql 脚本按照对应版本号，按照顺序存储在一个数组中
  - 实现数据库文件的备份逻辑，在数据库连接之前备份数据库文件，或者调用 `db.backup` 方法备份
  - 从 `db_version` 表中获取当前数据库版本，如果没有数据则返回 `0.0.0`，和当前数据库版本对比（就是当前应用版本，app.getVersion()），如果数据库版本和当前版本一样，则不需要升级；否则获取 `migrations` 中包含所有升级版本的 sql 逻辑的数组，判断是否存在更新版本的升级逻辑，过滤掉更低的版本，如果存在就开始按照版本顺序依次执行 sql 升级，否则不需要升级

- 下面是为 DB 类增加了升级的逻辑

  ```ts
  import sqlite from 'better-sqlite3';
  import { ConfigModel } from './entities/config.js';
  import { DBVersionModel } from './entities/db_version.js';
  import { app } from 'electron';
  import path from 'node:path';
  import fs from 'node:fs';
  // 版本比较工具函数，用于判断版本高低（如 1.0.1 > 1.0.0）
  import { compareVersion } from '../utils.js';
  // 错误日志工具
  import { logErrorInfo } from '../utils.js';
  import { ModelInstance } from './orm.js';
  // 数据库迁移脚本集合，每个迁移脚本包含版本号和升级逻辑
  import { migrations } from './migrations.js';

  // 数据库表映射类型，定义支持的表名及对应模型实例类型
  type TableMap = {
    configs: ModelInstance<any>;
    db_version: ModelInstance<any>;
  };

  // 检查是否需要升级的返回类型
  type NeedUpgrade = {
    res: boolean; // 是否需要升级
    migrations: any[]; // 需要执行的迁移脚本列表
  };

  /**
   * 数据库核心类，负责数据库连接、表初始化、备份、升级等核心操作
   */
  export class DB {
    db: sqlite.Database; // sqlite数据库实例
    dbPath: string; // 数据库文件路径
    currentDBVersion: string | undefined; // 当前数据库版本
    backupDBForUpgradePath: string | undefined; // 升级前的备份文件路径
    // 存储表名与模型实例的映射关系
    tables: Map<keyof TableMap, ModelInstance<any>> = new Map();

    /**
     * 构造函数，初始化数据库连接
     * @param options sqlite配置项
     */
    constructor(options: sqlite.Options) {
      const dbPath = this.getDatabasePath();
      // 创建sqlite实例，开启日志输出
      const db = new sqlite(dbPath, { verbose: console.log, ...options });
      this.db = db;
      this.dbPath = dbPath;
    }

    /**
     * 初始化数据库表结构
     * @param models 模型实例列表（每个模型对应一个表）
     */
    init(models: ModelInstance<any>[]) {
      models.forEach((instance: ModelInstance<any>) => {
        // 调用模型的创建表方法（若表不存在则创建）
        instance.createTable();
        // 将表名与模型实例关联存储
        this.tables.set(instance.table as keyof TableMap, instance);
      });
    }

    /**
     * 获取指定表的模型实例
     * @param name 表名
     * @returns 对应的模型实例
     */
    getTable<K extends keyof TableMap>(name: K): ModelInstance<any> {
      return this.tables.get(name) as ModelInstance<any>;
    }

    /**
     * 获取数据库文件存储路径
     * 优先使用已存在的路径，否则在用户数据目录下创建database文件夹并生成app.db路径
     * @returns 数据库文件路径
     */
    getDatabasePath(): string {
      if (this.dbPath) {
        return this.dbPath;
      }
      const userDataPath = app.getPath('userData'); // 获取electron应用的用户数据目录
      const dbDir = path.join(userDataPath, 'database');

      // 若数据库目录不存在则创建（递归创建父目录）
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const dbPath = path.join(dbDir, 'app.db');
      log.info(`dbPath: ${dbPath}`);

      return dbPath;
    }

    /**
     * 升级前备份数据库文件
     * 生成带时间戳的备份文件（如 app.db.backup-1620000000000）
     */
    async backupDBForUpgrade() {
      const backupPath = `${this.dbPath}.backup-${new Date().getTime()}`;
      try {
        // 调用sqlite的备份方法创建备份
        await this.db.backup(backupPath);

        this.backupDBForUpgradePath = backupPath;
        log.info(`backup DB file for upgrade successfule：${backupPath}`);
      } catch (err) {
        logErrorInfo('backup DB file for upgrade failed:', err);
      }
    }

    /**
     * 升级失败时恢复数据库备份
     * 查找最新的备份文件（按时间戳倒序），覆盖当前数据库文件
     */
    restoreBackup() {
      log.info(`restore backup db`);
      // 查找当前数据库目录下所有备份文件（以app.db.backup-为前缀）
      const backupFiles = fs
        .readdirSync(path.dirname(this.dbPath))
        .filter(f => f.startsWith(path.basename(this.dbPath) + '.backup-'))
        .sort((a, b) => b.localeCompare(a)); // 按文件名倒序（最新的备份在前面）

      if (backupFiles.length === 0) {
        log.error(`no backup DB file`);
        return;
      }
      log.info(`restore backup db: ${backupFiles[0]}`);

      try {
        const latestBackup = path.join(
          path.dirname(this.dbPath),
          backupFiles[0]
        );
        log.info(
          `latestBackup: ${latestBackup} \n this.dbPath: ${this.dbPath}`
        );
        // 复制最新备份到当前数据库路径（使用文件克隆优化性能）
        fs.copyFileSync(
          latestBackup,
          this.dbPath,
          fs.constants.COPYFILE_FICLONE
        );
        log.info(`restore backup successful：${latestBackup}`);
        // 恢复后删除备份文件
        fs.unlinkSync(latestBackup);
        log.info(`unlink latestBackup successful: ${latestBackup}`);
      } catch (err: any) {
        logErrorInfo('restore backup failed:', err);
      }
    }

    /**
     * 检查数据库是否需要升级
     * 1. 从db_version表获取当前数据库版本
     * 2. 筛选出比当前版本高的迁移脚本
     * 3. 返回是否需要升级及对应的迁移脚本
     * @returns 是否需要升级的结果
     */
    checkUpgrade(): NeedUpgrade {
      // 获取db_version表的模型实例（用于查询/更新数据库版本）
      const dbVersionRepository: ModelInstance<any> =
        this.getTable('db_version');
      const allDBVersions = dbVersionRepository.findAll(); // 查询所有版本记录（通常只有一条）
      log.info(`db upgrade allDBVersions: ${JSON.stringify(allDBVersions)}`);

      let currentDBVersion = '';

      if (allDBVersions.length > 0) {
        // 若存在版本记录，取第一条的version字段
        currentDBVersion = allDBVersions[0].version;
        log.info(`db upgrade currentDBVersion: ${currentDBVersion}`);
      } else {
        // 若不存在版本记录（首次初始化），插入初始版本0.0.0
        const newDBVersion = dbVersionRepository.upsert(
          {
            version: '0.0.0',
          },
          {
            conflictPaths: ['version'], // 若version冲突则不插入
            skipUpdateIfNoValuesChanged: true,
          }
        );
        currentDBVersion = newDBVersion.version;
        log.info(`db upgrade first insert db version 0.0.0`);
      }
      this.currentDBVersion = currentDBVersion;

      // 筛选出所有版本高于当前数据库版本的迁移脚本
      const filteredMigrations = migrations.filter(
        i => compareVersion(i.version, currentDBVersion) > 0
      );
      log.info(
        `db upgrade filteredMigrations: ${JSON.stringify(filteredMigrations)}`
      );

      // 按版本号升序排序迁移脚本（确保低版本迁移先执行）
      const sortMigrations = filteredMigrations.sort((a, b) =>
        compareVersion(a.version, b.version)
      );
      log.info(`db upgrade sortMigrations: ${JSON.stringify(sortMigrations)}`);

      // 若没有需要执行的迁移脚本
      if (sortMigrations.length <= 0) {
        log.info(`db current is latest version`);
        // 若存在备份文件则删除（无需升级，备份无用）
        if (this.backupDBForUpgradePath) {
          fs.promises
            .unlink(this.backupDBForUpgradePath)
            .then()
            .catch(err => {
              logErrorInfo(
                `db current is latest version unlink backup failed`,
                err
              );
            });
        }
        return {
          res: false,
          migrations: [],
        };
      }

      // 需要升级，返回迁移脚本列表
      return {
        res: true,
        migrations: sortMigrations,
      };
    }

    /**
     * 执行数据库升级逻辑
     * 1. 检查是否需要升级
     * 2. 若需要，按顺序执行迁移脚本（事务保证原子性）
     * 3. 升级成功则更新数据库版本为应用当前版本；失败则恢复备份
     */
    upgrade() {
      const { res, migrations } = this.checkUpgrade();
      if (res) {
        const dbVersionRepository: ModelInstance<any> =
          this.getTable('db_version');

        let hasErr: boolean = false; // 标记升级过程是否出错

        // 遍历迁移脚本，按顺序执行升级
        for (const upgrade of migrations) {
          try {
            log.info(`upgrade version ${upgrade.version} begain`);
            // 使用事务执行当前迁移脚本（确保升级操作的原子性，出错可回滚）
            const transaction = this.db.transaction(() => {
              upgrade.up(this.db); // 调用迁移脚本的up方法执行具体升级操作
            });
            transaction();
          } catch (err) {
            hasErr = true; // 标记出错
            logErrorInfo(
              `upgrade version ${upgrade.version} failed, will roll back to version ${this.currentDBVersion}`,
              err
            );
            break; // 中断迁移流程
          }
        }

        if (!hasErr) {
          // 升级成功：更新数据库版本为应用版本（electron的app.getVersion()）
          const newVersion = app.getVersion();
          log.info(`db upgrade successful current version: ${newVersion}`);

          // 清除旧版本记录，插入新版本
          dbVersionRepository.deleteAll();
          dbVersionRepository.upsert(
            {
              version: newVersion,
            },
            {
              conflictPaths: ['version'],
              skipUpdateIfNoValuesChanged: true,
            }
          );
          this.currentDBVersion = newVersion;

          // 升级成功后删除备份文件
          if (this.backupDBForUpgradePath) {
            fs.promises
              .unlink(this.backupDBForUpgradePath)
              .then()
              .catch(err => {
                logErrorInfo(
                  `db current is latest version unlink backup failed`,
                  err
                );
              });
          }
        } else {
          // 升级失败：恢复到升级前的备份
          this.restoreBackup();
        }
      }
    }
  }

  let alreadyInitialized = false; // 标记数据库是否已初始化

  /**
   * 初始化数据库入口函数
   * 确保数据库只初始化一次，处理初始化流程：备份->初始化表->执行升级
   * @returns 数据库实例或null（初始化失败）
   */
  export function initializeDatabase(): null | DB {
    if (alreadyInitialized) {
      return global.db;
    }
    let db: DB;
    try {
      db = new DB({ verbose: global.log.info });
      // 初始化流程：先备份数据库，再初始化表结构，最后执行升级
      db.backupDBForUpgrade()
        .then(() => {
          // 初始化配置表和版本表
          db.init([new ConfigModel(db.db), new DBVersionModel(db.db)]);
          db.upgrade(); // 执行升级检查和操作
        })
        .catch(err => {
          // 备份失败仍继续初始化表和升级（可能存在风险，但保证程序继续运行）
          logErrorInfo(`backupDBForUpgrade err`, err);
          db.init([new ConfigModel(db.db), new DBVersionModel(db.db)]);
          db.upgrade();
        });
    } catch (err) {
      logErrorInfo('db initialize failed', err);
      return null;
    }
    log.info(`db initialize successful`);
    global.db = db; // 挂载到全局对象
    alreadyInitialized = true;

    return db;
  }
  ```

- 下面是 `migrations` 据库迁移脚本集合，每个迁移脚本包含版本号和升级逻辑

  ```ts
  import sqlite from 'better-sqlite3';
  import { formatLocalTime } from '../utils.js';

  const migrations = [
    {
      version: '0.0.19',
      up: (db: sqlite.Database) => {
        // if already have data in table
        // ALTER TABLE configs ADD COLUMN create_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')) will cause error below
        // Cannot add a column with non-constant default
        // db.exec(`
        //     ALTER TABLE configs
        //     ADD COLUMN create_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime'))
        //   `);
        // db.exec(`
        //     ALTER TABLE configs
        //     ADD COLUMN update_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime'))
        //   `);
        const now: string = formatLocalTime();
        global.log.info(`now: ${now}`);

        db.exec(`
            ALTER TABLE configs
            ADD COLUMN create_at TEXT NOT NULL DEFAULT '${now}'
          `);
        db.exec(`
            ALTER TABLE configs
            ADD COLUMN update_at TEXT NOT NULL DEFAULT '${now}'
          `);
      },
    },
  ];

  export { migrations };
  ```

- 下面是新增加的 `db_version` 表

  ```ts
  import { TableModel, ExtractData } from '../orm.js';

  export class DBVersionModel extends TableModel<DBVersionSchema> {
    table = 'db_version';
    schema: DBVersionSchema = {
      version: {
        type: 'text',
        primary: true,
        default: '0.0.0',
      },
      create_at: {
        type: 'text',
        notNull: true,
        default: { raw: "DATETIME('now', 'localtime')" },
      },
      update_at: {
        type: 'text',
        notNull: true,
        default: { raw: "DATETIME('now', 'localtime')" },
      },
    };
  }

  type DBVersionSchema = {
    version: {
      type: 'text';
      primary: true;
      default: string;
    };
    create_at: {
      type: 'text';
      notNull: true;
      default: { raw: string };
    };
    update_at: {
      type: 'text';
      notNull: true;
      default: { raw: string };
    };
  };

  export type DBVersionData = ExtractData<DBVersionSchema>;
  ```
