// https://github.com/webpack/webpack-dev-server/blob/master/lib/Server.js

"use strict";

const os = require("os");
const path = require("path");
const url = require("url");
const util = require("util");
const fs = require("graceful-fs");
const ipaddr = require("ipaddr.js");
const internalIp = require("internal-ip");
const killable = require("killable");
const express = require("express");
const { validate } = require("schema-utils");
const schema = require("./options.json");

if (!process.env.WEBPACK_SERVE) {
  process.env.WEBPACK_SERVE = true;
}

class Server {
  constructor(options = {}, compiler) {
    // TODO: remove this after plugin support is published

    if (options.hooks) {
      const showDeprecationWarning = util.deprecate(
        () => {},
        "Using 'compiler' as the first argument is deprecated. Please use 'options' as the first argument and 'compiler' as the second argument.",
        "DEP_WEBPACK_DEV_SERVER_API"
      );

      showDeprecationWarning();

      [options, compiler] = [compiler, options];
    }

    validate(schema, options, "webpack Dev Server");

    this.options = options;
    this.staticWatchers = [];
    // Keep track of websocket proxies for external websocket upgrade.
    this.webSocketProxies = [];

    this.compiler = compiler;
  }

  static get DEFAULT_STATS() {
    return {
      all: false,
      hash: true,
      assets: true,
      warnings: true,
      errors: true,
      errorDetails: false,
    };
  }

  static getHostname(hostname) {
    if (hostname === "local-ip") {
      return internalIp.v4.sync() || internalIp.v6.sync() || "0.0.0.0";
    } else if (hostname === "local-ipv4") {
      return internalIp.v4.sync() || "0.0.0.0";
    } else if (hostname === "local-ipv6") {
      return internalIp.v6.sync() || "::";
    }

    return hostname;
  }

  static getFreePort(port) {
    const pRetry = require("p-retry");
    const portfinder = require("portfinder");

    if (port && port !== "auto") {
      return Promise.resolve(port);
    }

    function runPortFinder() {
      return new Promise((resolve, reject) => {
        // Default port
        portfinder.basePort = process.env.WEBPACK_DEV_SERVER_BASE_PORT || 8080;
        portfinder.getPort((error, foundPort) => {
          if (error) {
            return reject(error);
          }

          return resolve(foundPort);
        });
      });
    }

    // Try to find unused port and listen on it for 3 times,
    // if port is not specified in options.
    const defaultPortRetry =
      parseInt(process.env.WEBPACK_DEV_SERVER_PORT_RETRY, 10) || 3;

    return pRetry(runPortFinder, { retries: defaultPortRetry });
  }

  static findCacheDir() {
    const cwd = process.cwd();

    let dir = cwd;

    for (;;) {
      try {
        if (fs.statSync(path.join(dir, "package.json")).isFile()) break;
        // eslint-disable-next-line no-empty
      } catch (e) {}

      const parent = path.dirname(dir);

      if (dir === parent) {
        // eslint-disable-next-line no-undefined
        dir = undefined;
        break;
      }

      dir = parent;
    }

    if (!dir) {
      return path.resolve(cwd, ".cache/webpack-dev-server");
    } else if (process.versions.pnp === "1") {
      return path.resolve(dir, ".pnp/.cache/webpack-dev-server");
    } else if (process.versions.pnp === "3") {
      return path.resolve(dir, ".yarn/.cache/webpack-dev-server");
    }

    return path.resolve(dir, "node_modules/.cache/webpack-dev-server");
  }

  getCompilerConfigArray() {
    const compilers = this.compiler.compilers
      ? this.compiler.compilers
      : [this.compiler];

    return compilers.map((compiler) => compiler.options);
  }

  // eslint-disable-next-line class-methods-use-this
  normalizeOptions(options) {
    // TODO: improve this to not use .find for compiler watchOptions
    const configArray = this.getCompilerConfigArray(this.compiler);
    const watchOptionsConfig = configArray.find(
      (config) => config.watch !== false && config.watchOptions
    );
    const watchOptions = watchOptionsConfig
      ? watchOptionsConfig.watchOptions
      : {};

    const defaultOptionsForStatic = {
      directory: path.join(process.cwd(), "public"),
      staticOptions: {},
      publicPath: ["/"],
      serveIndex: { icons: true },
      // Respect options from compiler watchOptions
      watch: watchOptions,
    };

    if (typeof options.allowedHosts === "undefined") {
      // allowedHosts allows some default hosts picked from
      // `options.host` or `webSocketURL.hostname` and `localhost`
      options.allowedHosts = "auto";
    }
    if (
      typeof options.allowedHosts === "string" &&
      options.allowedHosts !== "auto" &&
      options.allowedHosts !== "all"
    ) {
      // we store allowedHosts as array when supplied as string
      options.allowedHosts = [options.allowedHosts];
    }

    if (typeof options.bonjour === "undefined") {
      options.bonjour = false;
    } else if (typeof options.bonjour === "boolean") {
      options.bonjour = options.bonjour ? {} : false;
    }

    if (
      typeof options.client === "undefined" ||
      (typeof options.client === "object" && options.client !== null)
    ) {
      if (!options.client) {
        options.client = {};
      }

      if (typeof options.client.webSocketURL === "undefined") {
        options.client.webSocketURL = {};
      } else if (typeof options.client.webSocketURL === "string") {
        const parsedURL = new URL(options.client.webSocketURL);

        options.client.webSocketURL = {
          protocol: parsedURL.protocol,
          hostname: parsedURL.hostname,
          port: parsedURL.port.length > 0 ? Number(parsedURL.port) : "",
          pathname: parsedURL.pathname,
          username: parsedURL.username,
          password: parsedURL.password,
        };
      } else if (typeof options.client.webSocketURL.port === "string") {
        options.client.webSocketURL.port = Number(
          options.client.webSocketURL.port
        );
      }

      // Enable client overlay by default
      if (typeof options.client.overlay === "undefined") {
        options.client.overlay = true;
      } else if (typeof options.client.overlay !== "boolean") {
        options.client.overlay = {
          errors: true,
          warnings: true,
          ...options.client.overlay,
        };
      }
    }

    if (typeof options.compress === "undefined") {
      options.compress = true;
    }

    if (typeof options.devMiddleware === "undefined") {
      options.devMiddleware = {};
    }

    // No need to normalize `headers`

    if (typeof options.historyApiFallback === "undefined") {
      options.historyApiFallback = false;
    } else if (
      typeof options.historyApiFallback === "boolean" &&
      options.historyApiFallback
    ) {
      options.historyApiFallback = {};
    }

    // No need to normalize `host`

    options.hot =
      typeof options.hot === "boolean" || options.hot === "only"
        ? options.hot
        : true;

    // if the user enables http2, we can safely enable https
    if ((options.http2 && !options.https) || options.https === true) {
      options.https = {
        requestCert: false,
      };
    }

    // https option
    if (options.https) {
      for (const property of ["cacert", "pfx", "key", "cert"]) {
        const value = options.https[property];
        const isBuffer = value instanceof Buffer;

        if (value && !isBuffer) {
          let stats = null;

          try {
            stats = fs.lstatSync(fs.realpathSync(value)).isFile();
          } catch (error) {
            // ignore error
          }

          // It is file
          options.https[property] = stats
            ? fs.readFileSync(path.resolve(value))
            : value;
        }
      }

      let fakeCert;

      if (!options.https.key || !options.https.cert) {
        const certificateDir = Server.findCacheDir();
        const certificatePath = path.join(certificateDir, "server.pem");
        let certificateExists = fs.existsSync(certificatePath);

        if (certificateExists) {
          const certificateTtl = 1000 * 60 * 60 * 24;
          const certificateStat = fs.statSync(certificatePath);

          const now = new Date();

          // cert is more than 30 days old, kill it with fire
          if ((now - certificateStat.ctime) / certificateTtl > 30) {
            const del = require("del");

            this.logger.info(
              "SSL Certificate is more than 30 days old. Removing."
            );

            del.sync([certificatePath], { force: true });

            certificateExists = false;
          }
        }

        if (!certificateExists) {
          this.logger.info("Generating SSL Certificate");

          const selfsigned = require("selfsigned");
          const attributes = [{ name: "commonName", value: "localhost" }];
          const pems = selfsigned.generate(attributes, {
            algorithm: "sha256",
            days: 30,
            keySize: 2048,
            extensions: [
              // {
              //   name: 'basicConstraints',
              //   cA: true,
              // },
              {
                name: "keyUsage",
                keyCertSign: true,
                digitalSignature: true,
                nonRepudiation: true,
                keyEncipherment: true,
                dataEncipherment: true,
              },
              {
                name: "extKeyUsage",
                serverAuth: true,
                clientAuth: true,
                codeSigning: true,
                timeStamping: true,
              },
              {
                name: "subjectAltName",
                altNames: [
                  {
                    // type 2 is DNS
                    type: 2,
                    value: "localhost",
                  },
                  {
                    type: 2,
                    value: "localhost.localdomain",
                  },
                  {
                    type: 2,
                    value: "lvh.me",
                  },
                  {
                    type: 2,
                    value: "*.lvh.me",
                  },
                  {
                    type: 2,
                    value: "[::1]",
                  },
                  {
                    // type 7 is IP
                    type: 7,
                    ip: "127.0.0.1",
                  },
                  {
                    type: 7,
                    ip: "fe80::1",
                  },
                ],
              },
            ],
          });

          fs.mkdirSync(certificateDir, { recursive: true });
          fs.writeFileSync(certificatePath, pems.private + pems.cert, {
            encoding: "utf8",
          });
        }

        fakeCert = fs.readFileSync(certificatePath);
      }

      options.https.key = options.https.key || fakeCert;
      options.https.cert = options.https.cert || fakeCert;
    }

    if (typeof options.ipc === "boolean") {
      const isWindows = process.platform === "win32";
      const pipePrefix = isWindows ? "\\\\.\\pipe\\" : os.tmpdir();
      const pipeName = "webpack-dev-server.sock";

      options.ipc = path.join(pipePrefix, pipeName);
    }

    options.liveReload =
      typeof options.liveReload !== "undefined" ? options.liveReload : true;

    // https://github.com/webpack/webpack-dev-server/issues/1990
    const defaultOpenOptions = { wait: false };
    const getOpenItemsFromObject = ({ target, ...rest }) => {
      const normalizedOptions = { ...defaultOpenOptions, ...rest };

      if (typeof normalizedOptions.app === "string") {
        normalizedOptions.app = {
          name: normalizedOptions.app,
        };
      }

      const normalizedTarget = typeof target === "undefined" ? "<url>" : target;

      if (Array.isArray(normalizedTarget)) {
        return normalizedTarget.map((singleTarget) => {
          return { target: singleTarget, options: normalizedOptions };
        });
      }

      return [{ target: normalizedTarget, options: normalizedOptions }];
    };

    if (typeof options.open === "undefined") {
      options.open = [];
    } else if (typeof options.open === "boolean") {
      options.open = options.open
        ? [{ target: "<url>", options: defaultOpenOptions }]
        : [];
    } else if (typeof options.open === "string") {
      options.open = [{ target: options.open, options: defaultOpenOptions }];
    } else if (Array.isArray(options.open)) {
      const result = [];

      options.open.forEach((item) => {
        if (typeof item === "string") {
          result.push({ target: item, options: defaultOpenOptions });

          return;
        }

        result.push(...getOpenItemsFromObject(item));
      });

      options.open = result;
    } else {
      options.open = [...getOpenItemsFromObject(options.open)];
    }

    if (typeof options.port === "string" && options.port !== "auto") {
      options.port = Number(options.port);
    }

    /**
     * Assume a proxy configuration specified as:
     * proxy: {
     *   'context': { options }
     * }
     * OR
     * proxy: {
     *   'context': 'target'
     * }
     */
    if (typeof options.proxy !== "undefined") {
      if (!Array.isArray(options.proxy)) {
        if (Object.prototype.hasOwnProperty.call(options.proxy, "target")) {
          options.proxy = [options.proxy];
        } else {
          options.proxy = Object.keys(options.proxy).map((context) => {
            let proxyOptions;
            // For backwards compatibility reasons.
            const correctedContext = context
              .replace(/^\*$/, "**")
              .replace(/\/\*$/, "");

            if (typeof options.proxy[context] === "string") {
              proxyOptions = {
                context: correctedContext,
                target: options.proxy[context],
              };
            } else {
              proxyOptions = { ...options.proxy[context] };
              proxyOptions.context = correctedContext;
            }

            const getLogLevelForProxy = (level) => {
              if (level === "none") {
                return "silent";
              }

              if (level === "log") {
                return "info";
              }

              if (level === "verbose") {
                return "debug";
              }

              return level;
            };

            const configWithDevServer =
              configArray.find((config) => config.devServer) || configArray[0];

            if (typeof proxyOptions.logLevel === "undefined") {
              proxyOptions.logLevel = getLogLevelForProxy(
                configWithDevServer.infrastructureLogging.level
              );
            }

            if (typeof proxyOptions.logProvider === "undefined") {
              proxyOptions.logProvider = () => this.logger;
            }

            return proxyOptions;
          });
        }
      }
    }

    if (typeof options.setupExitSignals === "undefined") {
      options.setupExitSignals = true;
    }

    if (typeof options.static === "undefined") {
      options.static = [defaultOptionsForStatic];
    } else if (typeof options.static === "boolean") {
      options.static = options.static ? [defaultOptionsForStatic] : false;
    } else if (typeof options.static === "string") {
      options.static = [
        { ...defaultOptionsForStatic, directory: options.static },
      ];
    } else if (Array.isArray(options.static)) {
      options.static = options.static.map((item) => {
        if (typeof item === "string") {
          return { ...defaultOptionsForStatic, directory: item };
        }

        return { ...defaultOptionsForStatic, ...item };
      });
    } else {
      options.static = [{ ...defaultOptionsForStatic, ...options.static }];
    }

    if (options.static) {
      const isAbsoluteUrl = require("is-absolute-url");

      options.static.forEach((staticOption) => {
        if (isAbsoluteUrl(staticOption.directory)) {
          throw new Error("Using a URL as static.directory is not supported");
        }

        // ensure that publicPath is an array
        if (typeof staticOption.publicPath === "string") {
          staticOption.publicPath = [staticOption.publicPath];
        }

        // ensure that watch is an object if true
        if (staticOption.watch === true) {
          staticOption.watch = defaultOptionsForStatic.watch;
        }

        // ensure that serveIndex is an object if true
        if (staticOption.serveIndex === true) {
          staticOption.serveIndex = defaultOptionsForStatic.serveIndex;
        }
      });
    }

    if (typeof options.watchFiles === "string") {
      options.watchFiles = [{ paths: options.watchFiles, options: {} }];
    } else if (
      typeof options.watchFiles === "object" &&
      options.watchFiles !== null &&
      !Array.isArray(options.watchFiles)
    ) {
      options.watchFiles = [
        {
          paths: options.watchFiles.paths,
          options: options.watchFiles.options || {},
        },
      ];
    } else if (Array.isArray(options.watchFiles)) {
      options.watchFiles = options.watchFiles.map((item) => {
        if (typeof item === "string") {
          return { paths: item, options: {} };
        }

        return { paths: item.paths, options: item.options || {} };
      });
    } else {
      options.watchFiles = [];
    }

    const defaultWebSocketServerType = "ws";
    const defaultWebSocketServerOptions = { path: "/ws" };

    if (typeof options.webSocketServer === "undefined") {
      options.webSocketServer = {
        type: defaultWebSocketServerType,
        options: defaultWebSocketServerOptions,
      };
    } else if (
      typeof options.webSocketServer === "boolean" &&
      !options.webSocketServer
    ) {
      options.webSocketServer = false;
    } else if (
      typeof options.webSocketServer === "string" ||
      typeof options.webSocketServer === "function"
    ) {
      options.webSocketServer = {
        type: options.webSocketServer,
        options: defaultWebSocketServerOptions,
      };
    } else {
      options.webSocketServer = {
        type: options.webSocketServer.type || defaultWebSocketServerType,
        options: {
          ...defaultWebSocketServerOptions,
          ...options.webSocketServer.options,
        },
      };

      if (typeof options.webSocketServer.options.port === "string") {
        options.webSocketServer.options.port = Number(
          options.webSocketServer.options.port
        );
      }
    }
  }

  initialize() {
    this.applyDevServerPlugin();

    if (this.options.client && this.options.client.progress) {
      this.setupProgressPlugin();
    }

    this.setupHooks();
    this.setupApp();
    this.setupHostHeaderCheck();
    this.setupDevMiddleware();
    // Should be after `webpack-dev-middleware`, otherwise other middlewares might rewrite response
    this.setupBuiltInRoutes();
    this.setupWatchFiles();
    this.setupFeatures();
    this.createServer();

    killable(this.server);

    if (this.options.setupExitSignals) {
      const signals = ["SIGINT", "SIGTERM"];

      signals.forEach((signal) => {
        process.on(signal, () => {
          this.close(() => {
            // eslint-disable-next-line no-process-exit
            process.exit();
          });
        });
      });
    }

    // Proxy WebSocket without the initial http request
    // https://github.com/chimurai/http-proxy-middleware#external-websocket-upgrade
    // eslint-disable-next-line func-names
    this.webSocketProxies.forEach(function (webSocketProxy) {
      this.server.on("upgrade", webSocketProxy.upgrade);
    }, this);
  }

  applyDevServerPlugin() {
    const DevServerPlugin = require("./utils/DevServerPlugin");

    const compilers = this.compiler.compilers || [this.compiler];

    // eslint-disable-next-line no-shadow
    compilers.forEach((compiler) => {
      new DevServerPlugin(this.options).apply(compiler);
    });
  }

  setupProgressPlugin() {
    const { ProgressPlugin } = this.compiler.webpack || require("webpack");

    new ProgressPlugin((percent, msg, addInfo, pluginName) => {
      percent = Math.floor(percent * 100);

      if (percent === 100) {
        msg = "Compilation completed";
      }

      if (addInfo) {
        msg = `${msg} (${addInfo})`;
      }

      if (this.webSocketServer) {
        this.sendMessage(this.webSocketServer.clients, "progress-update", {
          percent,
          msg,
          pluginName,
        });
      }

      if (this.server) {
        this.server.emit("progress-update", { percent, msg, pluginName });
      }
    }).apply(this.compiler);
  }

  setupApp() {
    // Init express server
    // eslint-disable-next-line new-cap
    
    // 初始化 express 服务
    // 使用 express 框架启动本地 server，让浏览器可以请求本地的静态资源。
    this.app = new express();
  }

  setupHooks() {
    const addHooks = (compiler) => {
      compiler.hooks.invalid.tap("webpack-dev-server", () => {
        if (this.webSocketServer) {
          this.sendMessage(this.webSocketServer.clients, "invalid");
        }
      });
      // done 钩子意味着编译结束
      compiler.hooks.done.tap("webpack-dev-server", (stats) => {
        if (this.webSocketServer) {
            // 当监听到一次 webpack 编译结束，就会调用 sendStats 方法
          this.sendStats(this.webSocketServer.clients, this.getStats(stats));
        }

        this.stats = stats;
      });
    };

    if (this.compiler.compilers) {
      this.compiler.compilers.forEach(addHooks);
    } else {
      addHooks(this.compiler);
    }
  }

  setupHostHeaderCheck() {
    this.app.all("*", (req, res, next) => {
      if (this.checkHeader(req.headers, "host")) {
        return next();
      }

      res.send("Invalid Host header");
    });
  }

  setupDevMiddleware() {
    const webpackDevMiddleware = require("webpack-dev-middleware");

    // middleware for serving webpack bundle
    this.middleware = webpackDevMiddleware(
      this.compiler,
      this.options.devMiddleware
    );
  }

  setupBuiltInRoutes() {
    const { app, middleware } = this;

    app.get("/__webpack_dev_server__/sockjs.bundle.js", (req, res) => {
      res.setHeader("Content-Type", "application/javascript");

      const { createReadStream } = require("graceful-fs");
      const clientPath = path.join(__dirname, "..", "client");

      createReadStream(
        path.join(clientPath, "modules/sockjs-client/index.js")
      ).pipe(res);
    });

    app.get("/webpack-dev-server/invalidate", (_req, res) => {
      this.invalidate();

      res.end();
    });

    app.get("/webpack-dev-server", (req, res) => {
      middleware.waitUntilValid((stats) => {
        res.setHeader("Content-Type", "text/html");
        res.write(
          '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>'
        );

        const statsForPrint =
          typeof stats.stats !== "undefined"
            ? stats.toJson().children
            : [stats.toJson()];

        res.write(`<h1>Assets Report:</h1>`);

        statsForPrint.forEach((item, index) => {
          res.write("<div>");

          const name =
            item.name || (stats.stats ? `unnamed[${index}]` : "unnamed");

          res.write(`<h2>Compilation: ${name}</h2>`);
          res.write("<ul>");

          const publicPath = item.publicPath === "auto" ? "" : item.publicPath;

          for (const asset of item.assets) {
            const assetName = asset.name;
            const assetURL = `${publicPath}${assetName}`;

            res.write(
              `<li>
              <strong><a href="${assetURL}" target="_blank">${assetName}</a></strong>
            </li>`
            );
          }

          res.write("</ul>");
          res.write("</div>");
        });

        res.end("</body></html>");
      });
    });
  }

  setupCompressFeature() {
    const compress = require("compression");

    this.app.use(compress());
  }

  setupProxyFeature() {
    const { createProxyMiddleware } = require("http-proxy-middleware");

    const getProxyMiddleware = (proxyConfig) => {
      const context = proxyConfig.context || proxyConfig.path;

      // It is possible to use the `bypass` method without a `target`.
      // However, the proxy middleware has no use in this case, and will fail to instantiate.
      if (proxyConfig.target) {
        return createProxyMiddleware(context, proxyConfig);
      }
    };
    /**
     * Assume a proxy configuration specified as:
     * proxy: [
     *   {
     *     context: ...,
     *     ...options...
     *   },
     *   // or:
     *   function() {
     *     return {
     *       context: ...,
     *       ...options...
     *     };
     *   }
     * ]
     */
    this.options.proxy.forEach((proxyConfigOrCallback) => {
      let proxyMiddleware;

      let proxyConfig =
        typeof proxyConfigOrCallback === "function"
          ? proxyConfigOrCallback()
          : proxyConfigOrCallback;

      proxyMiddleware = getProxyMiddleware(proxyConfig);

      if (proxyConfig.ws) {
        this.webSocketProxies.push(proxyMiddleware);
      }

      const handle = async (req, res, next) => {
        if (typeof proxyConfigOrCallback === "function") {
          const newProxyConfig = proxyConfigOrCallback(req, res, next);

          if (newProxyConfig !== proxyConfig) {
            proxyConfig = newProxyConfig;
            proxyMiddleware = getProxyMiddleware(proxyConfig);
          }
        }

        // - Check if we have a bypass function defined
        // - In case the bypass function is defined we'll retrieve the
        // bypassUrl from it otherwise bypassUrl would be null
        const isByPassFuncDefined = typeof proxyConfig.bypass === "function";
        const bypassUrl = isByPassFuncDefined
          ? await proxyConfig.bypass(req, res, proxyConfig)
          : null;

        if (typeof bypassUrl === "boolean") {
          // skip the proxy
          req.url = null;
          next();
        } else if (typeof bypassUrl === "string") {
          // byPass to that url
          req.url = bypassUrl;
          next();
        } else if (proxyMiddleware) {
          return proxyMiddleware(req, res, next);
        } else {
          next();
        }
      };

      this.app.use(handle);
      // Also forward error requests to the proxy so it can handle them.
      this.app.use((error, req, res, next) => handle(req, res, next));
    });
  }

  setupHistoryApiFallbackFeature() {
    const { historyApiFallback } = this.options;

    if (
      typeof historyApiFallback.logger === "undefined" &&
      !historyApiFallback.verbose
    ) {
      historyApiFallback.logger = this.logger.log.bind(
        this.logger,
        "[connect-history-api-fallback]"
      );
    }

    // Fall back to /index.html if nothing else matches.
    this.app.use(require("connect-history-api-fallback")(historyApiFallback));
  }

  setupStaticFeature() {
    this.options.static.forEach((staticOption) => {
      staticOption.publicPath.forEach((publicPath) => {
        this.app.use(
          publicPath,
          express.static(staticOption.directory, staticOption.staticOptions)
        );
      });
    });
  }

  setupStaticServeIndexFeature() {
    const serveIndex = require("serve-index");

    this.options.static.forEach((staticOption) => {
      staticOption.publicPath.forEach((publicPath) => {
        if (staticOption.serveIndex) {
          this.app.use(publicPath, (req, res, next) => {
            // serve-index doesn't fallthrough non-get/head request to next middleware
            if (req.method !== "GET" && req.method !== "HEAD") {
              return next();
            }

            serveIndex(staticOption.directory, staticOption.serveIndex)(
              req,
              res,
              next
            );
          });
        }
      });
    });
  }

  setupStaticWatchFeature() {
    this.options.static.forEach((staticOption) => {
      if (staticOption.watch) {
        this.watchFiles(staticOption.directory, staticOption.watch);
      }
    });
  }

  setupOnBeforeSetupMiddlewareFeature() {
    this.options.onBeforeSetupMiddleware(this);
  }

  setupWatchFiles() {
    const { watchFiles } = this.options;

    if (watchFiles.length > 0) {
      watchFiles.forEach((item) => {
        this.watchFiles(item.paths, item.options);
      });
    }
  }

  setupMiddleware() {
    this.app.use(this.middleware);
  }

  setupOnAfterSetupMiddlewareFeature() {
    this.options.onAfterSetupMiddleware(this);
  }

  setupHeadersFeature() {
    this.app.all("*", this.setHeaders.bind(this));
  }

  setupMagicHtmlFeature() {
    this.app.get("*", this.serveMagicHtml.bind(this));
  }

  setupFeatures() {
    const features = {
      compress: () => {
        if (this.options.compress) {
          this.setupCompressFeature();
        }
      },
      proxy: () => {
        if (this.options.proxy) {
          this.setupProxyFeature();
        }
      },
      historyApiFallback: () => {
        if (this.options.historyApiFallback) {
          this.setupHistoryApiFallbackFeature();
        }
      },
      static: () => {
        this.setupStaticFeature();
      },
      staticServeIndex: () => {
        this.setupStaticServeIndexFeature();
      },
      staticWatch: () => {
        this.setupStaticWatchFeature();
      },
      onBeforeSetupMiddleware: () => {
        if (typeof this.options.onBeforeSetupMiddleware === "function") {
          this.setupOnBeforeSetupMiddlewareFeature();
        }
      },
      onAfterSetupMiddleware: () => {
        if (typeof this.options.onAfterSetupMiddleware === "function") {
          this.setupOnAfterSetupMiddlewareFeature();
        }
      },
      middleware: () => {
        // include our middleware to ensure
        // it is able to handle '/index.html' request after redirect
        this.setupMiddleware();
      },
      headers: () => {
        this.setupHeadersFeature();
      },
      magicHtml: () => {
        this.setupMagicHtmlFeature();
      },
    };

    const runnableFeatures = [];

    // compress is placed last and uses unshift so that it will be the first middleware used
    if (this.options.compress) {
      runnableFeatures.push("compress");
    }

    if (this.options.onBeforeSetupMiddleware) {
      runnableFeatures.push("onBeforeSetupMiddleware");
    }

    runnableFeatures.push("headers", "middleware");

    if (this.options.proxy) {
      runnableFeatures.push("proxy", "middleware");
    }

    if (this.options.static) {
      runnableFeatures.push("static");
    }

    if (this.options.historyApiFallback) {
      runnableFeatures.push("historyApiFallback", "middleware");

      if (this.options.static) {
        runnableFeatures.push("static");
      }
    }

    if (this.options.static) {
      runnableFeatures.push("staticServeIndex", "staticWatch");
    }

    runnableFeatures.push("magicHtml");

    if (this.options.onAfterSetupMiddleware) {
      runnableFeatures.push("onAfterSetupMiddleware");
    }

    runnableFeatures.forEach((feature) => {
      features[feature]();
    });
  }

  createServer() {
    const https = require("https");
    const http = require("http");

    if (this.options.https) {
      if (this.options.http2) {
        // TODO: we need to replace spdy with http2 which is an internal module
        this.server = require("spdy").createServer(
          {
            ...this.options.https,
            spdy: {
              protocols: ["h2", "http/1.1"],
            },
          },
          this.app
        );
      } else {
        this.server = https.createServer(this.options.https, this.app);
      }
    } else {
      this.server = http.createServer(this.app);
    }

    this.server.on("error", (error) => {
      throw error;
    });
  }

  getWebSocketServerImplementation() {
    let implementation;
    let implementationFound = true;

    switch (typeof this.options.webSocketServer.type) {
      case "string":
        // Could be 'sockjs', in the future 'ws', or a path that should be required
        if (this.options.webSocketServer.type === "sockjs") {
          implementation = require("./servers/SockJSServer");
        } else if (this.options.webSocketServer.type === "ws") {
          implementation = require("./servers/WebsocketServer");
        } else {
          try {
            // eslint-disable-next-line import/no-dynamic-require
            implementation = require(this.options.webSocketServer.type);
          } catch (error) {
            implementationFound = false;
          }
        }
        break;
      case "function":
        implementation = this.options.webSocketServer.type;
        break;
      default:
        implementationFound = false;
    }

    if (!implementationFound) {
      throw new Error(
        "webSocketServer (webSocketServer.type) must be a string denoting a default implementation (e.g. 'ws', 'sockjs'), a full path to " +
          "a JS file which exports a class extending BaseServer (webpack-dev-server/lib/servers/BaseServer.js) " +
          "via require.resolve(...), or the class itself which extends BaseServer"
      );
    }

    return implementation;
  }

  createWebSocketServer() {
    this.webSocketServer = new (this.getWebSocketServerImplementation())(this);
    this.webSocketServer.implementation.on("connection", (client, request) => {
      const headers =
        // eslint-disable-next-line no-nested-ternary
        typeof request !== "undefined"
          ? request.headers
          : typeof client.headers !== "undefined"
          ? client.headers
          : // eslint-disable-next-line no-undefined
            undefined;

      if (!headers) {
        this.logger.warn(
          'webSocketServer implementation must pass headers for the "connection" event'
        );
      }

      if (
        !headers ||
        !this.checkHeader(headers, "host") ||
        !this.checkHeader(headers, "origin")
      ) {
        this.sendMessage([client], "error", "Invalid Host/Origin header");

        client.terminate();

        return;
      }

      if (this.options.hot === true || this.options.hot === "only") {
        this.sendMessage([client], "hot");
      }

      if (this.options.liveReload) {
        this.sendMessage([client], "liveReload");
      }

      if (this.options.client && this.options.client.progress) {
        this.sendMessage([client], "progress", this.options.client.progress);
      }

      if (this.options.client && this.options.client.overlay) {
        this.sendMessage([client], "overlay", this.options.client.overlay);
      }

      if (!this.stats) {
        return;
      }

      this.sendStats([client], this.getStats(this.stats), true);
    });
  }

  openBrowser(defaultOpenTarget) {
    const isAbsoluteUrl = require("is-absolute-url");
    const open = require("open");

    Promise.all(
      this.options.open.map((item) => {
        let openTarget;

        if (item.target === "<url>") {
          openTarget = defaultOpenTarget;
        } else {
          openTarget = isAbsoluteUrl(item.target)
            ? item.target
            : new URL(item.target, defaultOpenTarget).toString();
        }

        return open(openTarget, item.options).catch(() => {
          this.logger.warn(
            `Unable to open "${openTarget}" page${
              // eslint-disable-next-line no-nested-ternary
              item.options.app
                ? ` in "${item.options.app.name}" app${
                    item.options.app.arguments
                      ? ` with "${item.options.app.arguments.join(
                          " "
                        )}" arguments`
                      : ""
                  }`
                : ""
            }. If you are running in a headless environment, please do not use the "open" option or related flags like "--open", "--open-target", and "--open-app".`
          );
        });
      })
    );
  }

  runBonjour() {
    const bonjour = require("bonjour")();

    bonjour.publish({
      name: `Webpack Dev Server ${os.hostname()}:${this.options.port}`,
      port: this.options.port,
      type: this.options.https ? "https" : "http",
      subtypes: ["webpack"],
      ...this.options.bonjour,
    });

    process.on("exit", () => {
      bonjour.unpublishAll(() => {
        bonjour.destroy();
      });
    });
  }

  logStatus() {
    const colorette = require("colorette");

    const getColorsOption = (configArray) => {
      const statsOption = this.getStatsOption(configArray);

      let colorsEnabled = false;

      if (typeof statsOption === "object" && statsOption.colors) {
        colorsEnabled = statsOption.colors;
      }

      return colorsEnabled;
    };

    const colors = {
      info(useColor, msg) {
        if (useColor) {
          return colorette.cyan(msg);
        }

        return msg;
      },
      error(useColor, msg) {
        if (useColor) {
          return colorette.red(msg);
        }

        return msg;
      },
    };
    const useColor = getColorsOption(this.getCompilerConfigArray());

    if (this.options.ipc) {
      this.logger.info(`Project is running at: "${this.server.address()}"`);
    } else {
      const protocol = this.options.https ? "https" : "http";
      const { address, port } = this.server.address();
      const prettyPrintURL = (newHostname) =>
        url.format({ protocol, hostname: newHostname, port, pathname: "/" });

      let server;
      let localhost;
      let loopbackIPv4;
      let loopbackIPv6;
      let networkUrlIPv4;
      let networkUrlIPv6;

      if (this.options.host) {
        if (this.options.host === "localhost") {
          localhost = prettyPrintURL("localhost");
        } else {
          let isIP;

          try {
            isIP = ipaddr.parse(this.options.host);
          } catch (error) {
            // Ignore
          }

          if (!isIP) {
            server = prettyPrintURL(this.options.host);
          }
        }
      }

      const parsedIP = ipaddr.parse(address);

      if (parsedIP.range() === "unspecified") {
        localhost = prettyPrintURL("localhost");

        const networkIPv4 = internalIp.v4.sync();

        if (networkIPv4) {
          networkUrlIPv4 = prettyPrintURL(networkIPv4);
        }

        const networkIPv6 = internalIp.v6.sync();

        if (networkIPv6) {
          networkUrlIPv6 = prettyPrintURL(networkIPv6);
        }
      } else if (parsedIP.range() === "loopback") {
        if (parsedIP.kind() === "ipv4") {
          loopbackIPv4 = prettyPrintURL(parsedIP.toString());
        } else if (parsedIP.kind() === "ipv6") {
          loopbackIPv6 = prettyPrintURL(parsedIP.toString());
        }
      } else {
        networkUrlIPv4 =
          parsedIP.kind() === "ipv6" && parsedIP.isIPv4MappedAddress()
            ? prettyPrintURL(parsedIP.toIPv4Address().toString())
            : prettyPrintURL(address);

        if (parsedIP.kind() === "ipv6") {
          networkUrlIPv6 = prettyPrintURL(address);
        }
      }

      this.logger.info("Project is running at:");

      if (server) {
        this.logger.info(`Server: ${colors.info(useColor, server)}`);
      }

      if (localhost || loopbackIPv4 || loopbackIPv6) {
        const loopbacks = []
          .concat(localhost ? [colors.info(useColor, localhost)] : [])
          .concat(loopbackIPv4 ? [colors.info(useColor, loopbackIPv4)] : [])
          .concat(loopbackIPv6 ? [colors.info(useColor, loopbackIPv6)] : []);

        this.logger.info(`Loopback: ${loopbacks.join(", ")}`);
      }

      if (networkUrlIPv4) {
        this.logger.info(
          `On Your Network (IPv4): ${colors.info(useColor, networkUrlIPv4)}`
        );
      }

      if (networkUrlIPv6) {
        this.logger.info(
          `On Your Network (IPv6): ${colors.info(useColor, networkUrlIPv6)}`
        );
      }

      if (this.options.open.length > 0) {
        const openTarget = prettyPrintURL(this.options.host || "localhost");

        this.openBrowser(openTarget);
      }
    }

    if (this.options.static && this.options.static.length > 0) {
      this.logger.info(
        `Content not from webpack is served from '${colors.info(
          useColor,
          this.options.static
            .map((staticOption) => staticOption.directory)
            .join(", ")
        )}' directory`
      );
    }

    if (this.options.historyApiFallback) {
      this.logger.info(
        `404s will fallback to '${colors.info(
          useColor,
          this.options.historyApiFallback.index || "/index.html"
        )}'`
      );
    }

    if (this.options.bonjour) {
      const bonjourProtocol =
        this.options.bonjour.type || this.options.https ? "https" : "http";

      this.logger.info(
        `Broadcasting "${bonjourProtocol}" with subtype of "webpack" via ZeroConf DNS (Bonjour)`
      );
    }
  }

  listen(port, hostname, fn) {
    this.logger = this.compiler.getInfrastructureLogger("webpack-dev-server");
    this.normalizeOptions(this.options);

    if (typeof port === "function") {
      fn = port;
    }

    if (
      typeof port !== "undefined" &&
      typeof this.options.port !== "undefined" &&
      port !== this.options.port
    ) {
      this.options.port = port;

      this.logger.warn(
        'The "port" specified in options is different from the port passed as an argument. Will be used from arguments.'
      );
    }

    if (!this.options.port) {
      this.options.port = port;
    }

    if (
      typeof hostname !== "undefined" &&
      typeof this.options.host !== "undefined" &&
      hostname !== this.options.host
    ) {
      this.options.host = hostname;

      this.logger.warn(
        'The "host" specified in options is different from the host passed as an argument. Will be used from arguments.'
      );
    }

    if (!this.options.host) {
      this.options.host = hostname;
    }

    this.options.host = Server.getHostname(this.options.host);

    const resolveFreePortOrIPC = () => {
      if (this.options.ipc) {
        return new Promise((resolve, reject) => {
          const net = require("net");
          const socket = new net.Socket();

          socket.on("error", (error) => {
            if (error.code === "ECONNREFUSED") {
              fs.unlinkSync(this.options.ipc);

              resolve(this.options.ipc);

              return;
            } else if (error.code === "ENOENT") {
              resolve(this.options.ipc);

              return;
            }

            reject(error);
          });

          socket.connect({ path: this.options.ipc }, () => {
            throw new Error(`IPC "${this.options.ipc}" is already used`);
          });
        });
      }

      return Server.getFreePort(this.options.port).then((foundPort) => {
        this.options.port = foundPort;
      });
    };

    return resolveFreePortOrIPC()
      .then(() => {
        this.initialize();

        const listenOptions = this.options.ipc
          ? { path: this.options.ipc }
          : {
              host: this.options.host,
              port: this.options.port,
            };

        return this.server.listen(listenOptions, (error) => {
          if (this.options.ipc) {
            // chmod 666 (rw rw rw)
            const READ_WRITE = 438;

            fs.chmodSync(this.options.ipc, READ_WRITE);
          }

          if (this.options.webSocketServer) {
            try {
              this.createWebSocketServer();
            } catch (webSocketServerError) {
              fn.call(this.server, webSocketServerError);

              return;
            }
          }

          if (this.options.bonjour) {
            this.runBonjour();
          }

          this.logStatus();

          if (fn) {
            fn.call(this.server, error);
          }

          if (typeof this.options.onListening === "function") {
            this.options.onListening(this);
          }
        });
      })
      .catch((error) => {
        if (fn) {
          fn.call(this.server, error);
        }
      });
  }

  close(callback) {
    if (this.webSocketServer) {
      this.webSocketServer.implementation.close();
    }

    const prom = Promise.all(
      this.staticWatchers.map((watcher) => watcher.close())
    );
    this.staticWatchers = [];

    if (this.server) {
      this.server.kill(() => {
        // watchers must be closed before closing middleware
        prom.then(() => {
          this.middleware.close(callback);
        });
      });
    } else if (callback) {
      callback();
    }
  }

  // eslint-disable-next-line class-methods-use-this
  getStatsOption(configArray) {
    const isEmptyObject = (val) =>
      typeof val === "object" && Object.keys(val).length === 0;

    // in webpack@4 stats will not be defined if not provided,
    // but in webpack@5 it will be an empty object
    const statsConfig = configArray.find(
      (configuration) =>
        typeof configuration === "object" &&
        configuration.stats &&
        !isEmptyObject(configuration.stats)
    );

    return statsConfig ? statsConfig.stats : {};
  }

  getStats(statsObj) {
    const stats = Server.DEFAULT_STATS;

    const configArray = this.getCompilerConfigArray(this.compiler);
    const statsOption = this.getStatsOption(configArray);

    if (typeof statsOption === "object" && statsOption.warningsFilter) {
      stats.warningsFilter = statsOption.warningsFilter;
    }

    return statsObj.toJson(stats);
  }

  setHeaders(req, res, next) {
    let { headers } = this.options;

    if (headers) {
      if (typeof headers === "function") {
        headers = headers(req, res, this.middleware.context);
      }

      // eslint-disable-next-line guard-for-in
      for (const name in headers) {
        res.setHeader(name, headers[name]);
      }
    }

    next();
  }

  checkHeader(headers, headerToCheck) {
    // allow user to opt out of this security check, at their own risk
    // by explicitly enabling allowedHosts
    if (this.options.allowedHosts === "all") {
      return true;
    }

    // get the Host header and extract hostname
    // we don't care about port not matching
    const hostHeader = headers[headerToCheck];

    if (!hostHeader) {
      return false;
    }

    // use the node url-parser to retrieve the hostname from the host-header.
    const hostname = url.parse(
      // if hostHeader doesn't have scheme, add // for parsing.
      /^(.+:)?\/\//.test(hostHeader) ? hostHeader : `//${hostHeader}`,
      false,
      true
    ).hostname;

    // always allow requests with explicit IPv4 or IPv6-address.
    // A note on IPv6 addresses:
    // hostHeader will always contain the brackets denoting
    // an IPv6-address in URLs,
    // these are removed from the hostname in url.parse(),
    // so we have the pure IPv6-address in hostname.
    // always allow localhost host, for convenience (hostname === 'localhost')
    // allow hostname of listening address  (hostname === this.options.host)
    const isValidHostname =
      ipaddr.IPv4.isValid(hostname) ||
      ipaddr.IPv6.isValid(hostname) ||
      hostname === "localhost" ||
      hostname === this.options.host;

    if (isValidHostname) {
      return true;
    }

    const { allowedHosts } = this.options;

    // always allow localhost host, for convenience
    // allow if hostname is in allowedHosts
    if (Array.isArray(allowedHosts) && allowedHosts.length > 0) {
      for (let hostIdx = 0; hostIdx < allowedHosts.length; hostIdx++) {
        const allowedHost = allowedHosts[hostIdx];

        if (allowedHost === hostname) {
          return true;
        }

        // support "." as a subdomain wildcard
        // e.g. ".example.com" will allow "example.com", "www.example.com", "subdomain.example.com", etc
        if (allowedHost[0] === ".") {
          // "example.com"  (hostname === allowedHost.substring(1))
          // "*.example.com"  (hostname.endsWith(allowedHost))
          if (
            hostname === allowedHost.substring(1) ||
            hostname.endsWith(allowedHost)
          ) {
            return true;
          }
        }
      }
    }

    // Also allow if `client.webSocketURL.hostname` provided
    if (
      this.options.client &&
      typeof this.options.client.webSocketURL !== "undefined"
    ) {
      return this.options.client.webSocketURL.hostname === hostname;
    }

    // disallow
    return false;
  }

  // eslint-disable-next-line class-methods-use-this
  sendMessage(clients, type, data) {
    clients.forEach((client) => {
      // `sockjs` uses `1` to indicate client is ready to accept data
      // `ws` uses `WebSocket.OPEN`, but it is mean `1` too
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type, data }));
      }
    });
  }

  serveMagicHtml(req, res, next) {
    this.middleware.waitUntilValid(() => {
      const _path = req.path;

      try {
        const filename = this.middleware.getFilenameFromUrl(`${_path}.js`);
        const isFile = this.middleware.context.outputFileSystem
          .statSync(filename)
          .isFile();

        if (!isFile) {
          return next();
        }

        // Serve a page that executes the javascript
        const queries = req._parsedUrl.search || "";
        const responsePage = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script type="text/javascript" charset="utf-8" src="${_path}.js${queries}"></script></body></html>`;

        res.send(responsePage);
      } catch (error) {
        return next();
      }
    });
  }

  // Send stats to a socket or multiple sockets
  sendStats(clients, stats, force) {
    const shouldEmit =
      !force &&
      stats &&
      (!stats.errors || stats.errors.length === 0) &&
      (!stats.warnings || stats.warnings.length === 0) &&
      stats.assets &&
      stats.assets.every((asset) => !asset.emitted);

    if (shouldEmit) {
      this.sendMessage(clients, "still-ok");

      return;
    }
    // hash 事件
    this.sendMessage(clients, "hash", stats.hash);

    if (stats.errors.length > 0 || stats.warnings.length > 0) {
      if (stats.warnings.length > 0) {
        this.sendMessage(clients, "warnings", stats.warnings);
      }

      if (stats.errors.length > 0) {
        this.sendMessage(clients, "errors", stats.errors);
      }
    } else {
      // ok 事件
      this.sendMessage(clients, "ok");
    }
  }

  watchFiles(watchPath, watchOptions) {
    // duplicate the same massaging of options that watchpack performs
    // https://github.com/webpack/watchpack/blob/master/lib/DirectoryWatcher.js#L49
    // this isn't an elegant solution, but we'll improve it in the future
    // eslint-disable-next-line no-undefined
    const usePolling =
      typeof watchOptions.usePolling !== "undefined"
        ? watchOptions.usePolling
        : Boolean(watchOptions.poll);
    const interval =
      // eslint-disable-next-line no-nested-ternary
      typeof watchOptions.interval !== "undefined"
        ? watchOptions.interval
        : typeof watchOptions.poll === "number"
        ? watchOptions.poll
        : // eslint-disable-next-line no-undefined
          undefined;

    const finalWatchOptions = {
      ignoreInitial: true,
      persistent: true,
      followSymlinks: false,
      atomic: false,
      alwaysStat: true,
      ignorePermissionErrors: true,
      ignored: watchOptions.ignored,
      usePolling,
      interval,
    };

    const chokidar = require("chokidar");

    const watcher = chokidar.watch(watchPath, finalWatchOptions);

    // disabling refreshing on changing the content
    if (this.options.liveReload) {
      watcher.on("change", (item) => {
        if (this.webSocketServer) {
          this.sendMessage(
            this.webSocketServer.clients,
            "static-changed",
            item
          );
        }
      });
    }

    this.staticWatchers.push(watcher);
  }

  invalidate(callback) {
    if (this.middleware) {
      this.middleware.invalidate(callback);
    }
  }
}

const mergeExports = (obj, exports) => {
  const descriptors = Object.getOwnPropertyDescriptors(exports);

  for (const name of Object.keys(descriptors)) {
    const descriptor = descriptors[name];

    if (descriptor.get) {
      const fn = descriptor.get;

      Object.defineProperty(obj, name, {
        configurable: false,
        enumerable: true,
        get: fn,
      });
    } else if (typeof descriptor.value === "object") {
      Object.defineProperty(obj, name, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: mergeExports({}, descriptor.value),
      });
    } else {
      throw new Error(
        "Exposed values must be either a getter or an nested object"
      );
    }
  }

  return Object.freeze(obj);
};

module.exports = mergeExports(Server, {
  get schema() {
    return schema;
  },
  // TODO compatibility with webpack v4, remove it after drop
  cli: {
    get getArguments() {
      return () => require("../bin/cli-flags");
    },
    get processArguments() {
      return require("../bin/process-arguments");
    },
  },
});