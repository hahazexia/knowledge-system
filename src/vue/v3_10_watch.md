# watch 源码

```html
<script>
  const { reactive, watch } = Vue;

  const obj = reactive({
    name: '张三',
  });

  watch(obj, (newValue, oldValue) => {
    console.log(`newValue: ${newValue}, oldValue: ${oldValue}`);
  });

  setTimeout(() => {
    obj.name = '李四';
  }, 2000);
</script>
```

## watch

```ts
export function watch<T = any, Immediate extends Readonly<boolean> = false>(
  source: T | WatchSource<T>,
  cb: any,
  options?: WatchOptions<Immediate>
): WatchStopHandle {
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`
    );
  }
  // 调用了 doWatch
  return doWatch(source as any, cb, options);
}
```

## doWatch

```ts
function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  { immediate, deep, flush, onTrack, onTrigger }: WatchOptions = EMPTY_OBJ
): WatchStopHandle {
  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      );
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      );
    }
  }

  const warnInvalidSource = (s: unknown) => {
    warn(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
        `a reactive object, or an array of these types.`
    );
  };

  const instance = currentInstance;
  let getter: () => any;
  let forceTrigger = false;
  let isMultiSource = false;

  if (isRef(source)) {
    getter = () => source.value;
    forceTrigger = isShallow(source);
  } else if (isReactive(source)) {
    // 我们的例子中用的 reactive 变量，所以会走这里
    // getter 设置为直接返回 reactive 数据的函数
    getter = () => source;
    // 监听 reactive 数据，默认 deep 为 true
    deep = true;
  } else if (isArray(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => isReactive(s) || isShallow(s));
    getter = () =>
      source.map((s) => {
        if (isRef(s)) {
          return s.value;
        } else if (isReactive(s)) {
          return traverse(s);
        } else if (isFunction(s)) {
          return callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER);
        } else {
          __DEV__ && warnInvalidSource(s);
        }
      });
  } else if (isFunction(source)) {
    if (cb) {
      // getter with cb
      getter = () =>
        callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER);
    } else {
      // no cb -> simple effect
      getter = () => {
        if (instance && instance.isUnmounted) {
          return;
        }
        if (cleanup) {
          cleanup();
        }
        return callWithAsyncErrorHandling(
          source,
          instance,
          ErrorCodes.WATCH_CALLBACK,
          [onCleanup]
        );
      };
    }
  } else {
    getter = NOOP;
    __DEV__ && warnInvalidSource(source);
  }

  // 2.x array mutation watch compat
  if (__COMPAT__ && cb && !deep) {
    const baseGetter = getter;
    getter = () => {
      const val = baseGetter();
      if (
        isArray(val) &&
        checkCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance)
      ) {
        traverse(val);
      }
      return val;
    };
  }

  if (cb && deep) {
    const baseGetter = getter;
    getter = () => traverse(baseGetter());
  }

  let cleanup: () => void;
  let onCleanup: OnCleanup = (fn: () => void) => {
    cleanup = effect.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP);
    };
  };

  // in SSR there is no need to setup an actual effect, and it should be noop
  // unless it's eager
  if (__SSR__ && isInSSRComponentSetup) {
    // we will also not call the invalidate callback (+ runner is not set up)
    onCleanup = NOOP;
    if (!cb) {
      getter();
    } else if (immediate) {
      callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
        getter(),
        isMultiSource ? [] : undefined,
        onCleanup,
      ]);
    }
    return NOOP;
  }

  let oldValue = isMultiSource ? [] : INITIAL_WATCHER_VALUE;
  // job 非常重要 watch 的核心
  const job: SchedulerJob = () => {
    if (!effect.active) {
      return;
    }
    if (cb) {
      // watch(source, cb)
      const newValue = effect.run();
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? (newValue as any[]).some((v, i) =>
              hasChanged(v, (oldValue as any[])[i])
            )
          : hasChanged(newValue, oldValue)) ||
        (__COMPAT__ &&
          isArray(newValue) &&
          isCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance))
      ) {
        // cleanup before running cb again
        if (cleanup) {
          cleanup();
        }
        callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
          newValue,
          // pass undefined as the old value when it's changed for the first time
          oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
          onCleanup,
        ]);
        oldValue = newValue;
      }
    } else {
      // watchEffect
      effect.run();
    }
  };

  // important: mark the job as a watcher callback so that scheduler knows
  // it is allowed to self-trigger (#1727)
  job.allowRecurse = !!cb;
  // 声明一个 调度器
  let scheduler: EffectScheduler;
  if (flush === 'sync') {
    scheduler = job as any; // the scheduler function gets called directly
  } else if (flush === 'post') {
    scheduler = () => queuePostRenderEffect(job, instance && instance.suspense);
  } else {
    // 调度器赋值
    // default: 'pre'
    scheduler = () => queuePreFlushCb(job);
  }

  // reactiveEffect 实例，第二个参数是调度器
  const effect = new ReactiveEffect(getter, scheduler);

  if (__DEV__) {
    effect.onTrack = onTrack;
    effect.onTrigger = onTrigger;
  }

  // initial run
  if (cb) {
    if (immediate) {
      job();
    } else {
      // 计算 oldValue
      oldValue = effect.run();
    }
  } else if (flush === 'post') {
    queuePostRenderEffect(
      effect.run.bind(effect),
      instance && instance.suspense
    );
  } else {
    effect.run();
  }

  return () => {
    effect.stop();
    if (instance && instance.scope) {
      remove(instance.scope.effects!, effect);
    }
  };
}
```

当定时器触发 reactive 变量 setter 的时候，触发了 triggerEffects

```ts
function triggerEffect(
  effect: ReactiveEffect,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  if (effect !== activeEffect || effect.allowRecurse) {
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo));
    }
    if (effect.scheduler) {
      effect.scheduler();
    } else {
      effect.run();
    }
  }
}
```

这里可以看到会触发 watch 的 reactiveEffect 的 scheduler，会执行 `scheduler = () => queuePreFlushCb(job);`

```ts
export function queuePreFlushCb(cb: SchedulerJob) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
}
```

queuePreFlushCb 中又调用了 queueCb

```ts
function queueCb(
  cb: SchedulerJobs,
  activeQueue: SchedulerJob[] | null,
  pendingQueue: SchedulerJob[],
  index: number
) {
  if (!isArray(cb)) {
    if (
      !activeQueue ||
      !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)
    ) {
      // 将 job 函数 push 到 pendingQueue 中
      pendingQueue.push(cb);
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    pendingQueue.push(...cb);
  }
  // 调用 queueFlush
  queueFlush();
}
```

queueCb 将 job 函数 push 到 pendingQueue 中，然后调用 queueFlush

```ts
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true;
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
```

resolvedPromise 就是 promise.resolve()，flushJobs 被放入微任务中执行

```ts
function flushJobs(seen?: CountMap) {
  isFlushPending = false;
  isFlushing = true;
  if (__DEV__) {
    seen = seen || new Map();
  }

  // flushPreFlushCbs 中会触发 job 函数
  flushPreFlushCbs(seen);

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  queue.sort((a, b) => getId(a) - getId(b));

  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP;

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && job.active !== false) {
        if (__DEV__ && check(job)) {
          continue;
        }
        // console.log(`running:`, job.id)
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER);
      }
    }
  } finally {
    flushIndex = 0;
    queue.length = 0;

    flushPostFlushCbs(seen);

    isFlushing = false;
    currentFlushPromise = null;
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    if (
      queue.length ||
      pendingPreFlushCbs.length ||
      pendingPostFlushCbs.length
    ) {
      flushJobs(seen);
    }
  }
}
```

flushJobs 中调用了 flushPreFlushCbs，flushPreFlushCbs 中触发了 job 函数

```ts
export function flushPreFlushCbs(
  seen?: CountMap,
  parentJob: SchedulerJob | null = null
) {
  if (pendingPreFlushCbs.length) {
    currentPreFlushParentJob = parentJob;
    // 将 pendingPreFlushCbs 置空，将其中的 job 队列移动到 activePreFlushCbs 中准备执行
    activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
    pendingPreFlushCbs.length = 0;
    if (__DEV__) {
      seen = seen || new Map();
    }
    for (
      preFlushIndex = 0;
      preFlushIndex < activePreFlushCbs.length;
      preFlushIndex++
    ) {
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePreFlushCbs[preFlushIndex])
      ) {
        continue;
      }
      // for 循环执行 job 队列
      activePreFlushCbs[preFlushIndex]();
    }
    activePreFlushCbs = null;
    preFlushIndex = 0;
    currentPreFlushParentJob = null;
    // recursively flush until it drains
    flushPreFlushCbs(seen, parentJob);
  }
}
```

将 pendingPreFlushCbs 置空，将其中的 job 队列移动到 activePreFlushCbs 中准备执行，然后 for 循环执行 job 队列

```ts
// job 非常重要 watch 的核心
const job: SchedulerJob = () => {
  if (!effect.active) {
    return;
  }
  if (cb) {
    // watch(source, cb)
    // 计算 newValue
    const newValue = effect.run();
    if (
      deep ||
      forceTrigger ||
      (isMultiSource
        ? (newValue as any[]).some((v, i) =>
            hasChanged(v, (oldValue as any[])[i])
          )
        : hasChanged(newValue, oldValue)) ||
      (__COMPAT__ &&
        isArray(newValue) &&
        isCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance))
    ) {
      // cleanup before running cb again
      if (cleanup) {
        cleanup();
      }
      // cb 就是我们传递给 watch 的函数，callWithAsyncErrorHandling 只是为了做统一的 try catch 错误处理
      // 由此可知 job 函数的执行就是 watch 函数的执行
      callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
        newValue,
        // pass undefined as the old value when it's changed for the first time
        oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
        onCleanup,
      ]);
      // watch 函数执行结束，将 newValue 赋值给 oldValue
      oldValue = newValue;
    }
  } else {
    // watchEffect
    effect.run();
  }
};
```
