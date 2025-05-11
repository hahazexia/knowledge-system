# 实现 watch

## 懒执行 lazy

- computed 和 watch 代码中都使用了调度器，调度系统由两部分组成：

  - lazy 懒执行
  - scheduler 调度器

- 懒执行的实现很简单，就是在 effect 函数中创建 ReactiveEffect 之后，判断是否配置中传递了 lazy，如果没有传递 lazy，那么就立即执行 reactiveEffect.run

  ```ts
  if (!options || !options.lazy) {
    _effect.run();
  }
  ```

- 而在 watch 中，默认 lazy 是 true 的，所以要在之前的 effect 中实现 lazy 懒执行

  ```ts
  export interface ReactiveEffectOptions {
    lazy?: boolean;
    scheduler?: EffectScheduler;
  }

  export function effect<T = any>(
    fn: () => T,
    options?: ReactiveEffectOptions
  ) {
    const _effect = new ReactiveEffect(fn);

    // 懒执行
    if (!options || !options.lazy) {
      _effect.run();
    }
  }
  ```

- 当 options 传递了 scheduler，就将 reactiveEffect 和 options 合并，使它也包含 scheduler 属性，后续触发依赖的时候，就可以直接执行自定义的 scheduler

  ```ts
  export function effect<T = any>(
    fn: () => T,
    options?: ReactiveEffectOptions
  ) {
    const _effect = new ReactiveEffect(fn);

    if (options) {
      extend(_effect, options);
    }

    if (!options || !options.lazy) {
      _effect.run();
    }
  }
  ```

## 调度器 scheduler

```ts
// 对应 promise 的 pending 状态
let isFlushPending = false;

/**
 * promise.resolve()
 */
const resolvedPromise = Promise.resolve() as Promise<any>;

/**
 * 当前的执行任务
 */
let currentFlushPromise: Promise<void> | null = null;

/**
 * 待执行的任务队列
 */
const pendingPreFlushCbs: Function[] = [];

/**
 * 队列预处理函数
 */
export function queuePreFlushCb(cb: Function) {
  queueCb(cb, pendingPreFlushCbs);
}

/**
 * 队列处理函数
 */
function queueCb(cb: Function, pendingQueue: Function[]) {
  // 将所有的回调函数，放入队列中
  pendingQueue.push(cb);
  queueFlush();
}

/**
 * 将队列任务执行放到 promise 微任务中执行
 */
function queueFlush() {
  if (!isFlushPending) {
    isFlushPending = true;
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}

/**
 * 处理队列
 */
function flushJobs() {
  isFlushPending = false;
  flushPreFlushCbs();
}

/**
 * 依次处理队列中的任务
 */
export function flushPreFlushCbs() {
  if (pendingPreFlushCbs.length) {
    // 去重
    let activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
    // 清空待执行的任务队列
    pendingPreFlushCbs.length = 0;

    // 循环调用 cb
    for (let i = 0; i < activePreFlushCbs.length; i++) {
      activePreFlushCbs[i]();
    }
  }
}
```

## watch

```ts
import { EMPTY_OBJ, hasChanged, isObject } from '@vue/shared';
import { ReactiveEffect } from 'packages/reactivity/src/effect';
import { isReactive } from 'packages/reactivity/src/reactive';
import { queuePreFlushCb } from './scheduler';

/**
 * watch 配置项属性
 */
export interface WatchOptions<immediate = boolean> {
  immediate?: immediate;
  deep?: boolean;
}

/**
 * 指定的 watch 函数
 * @param source 监听的响应性数据
 * @param cb 回调函数
 * @param options 配置对象
 * @returns
 */
export function watch(source, cb: Function, options?: WatchOptions) {
  return doWatch(source, cb, options);
}

function doWatch(
  source,
  cb: Function,
  { immediate, deep }: WatchOptions = EMPTY_OBJ
) {
  // 触发 getter 的指定函数
  let getter: () => any;

  // 判断 source 如果是响应式数据，设置 getter 为返回 source 的函数，并且 deep 默认为 true
  if (isReactive(source)) {
    getter = () => source;
    deep = true;
  } else {
    getter = () => {};
  }

  // 存在回调函数并且 deep 为 true，就遍历触发响应式数据每一层属性的 getter 来收集依赖
  if (cb && deep) {
    const baseGetter = getter;
    getter = () => traverse(baseGetter());
  }

  // 旧值
  let oldValue = {};

  // job 函数本质上就是调用传递给 watch 的函数也就是 cb
  const job = () => {
    if (cb) {
      const newValue = effect.run();
      if (deep || hasChanged(newValue, oldValue)) {
        cb(newValue, oldValue);
        oldValue = newValue;
      }
    }
  };

  // 调度器，将 job 函数放入队列中，并且使用 promise 微任务来执行
  let scheduler = () => queuePreFlushCb(job);

  const effect = new ReactiveEffect(getter, scheduler);

  if (cb) {
    // 如果传递了 immediate 就立即调用一次 cb
    if (immediate) {
      job();
    } else {
      oldValue = effect.run();
    }
  } else {
    effect.run();
  }

  return () => {
    effect.stop();
  };
}

/**
 * 遍历响应式对象所有属性，从而触发依赖收集
 */
export function traverse(value: unknown) {
  if (!isObject(value)) {
    return value;
  }

  for (const key in value as object) {
    traverse((value as object)[key]);
  }

  return value;
}
```

## 总结

- watch 本质上还是通过依赖收集和依赖触发来实现的，类似发布订阅模式。传递给 watch 的 cb 就是副作用 effect，它内部会递归响应式数据的每一层，触发 getter 依赖收集，然后生成 job 函数，job 就是调用 cb，生成 scheduler 调度器，调度器中将 job 放入队列中，并且使用微任务执行，等到响应式数据 setter 触发依赖的时候，就会执行调度器
- 使用 scheduler 调度器是为了控制何时触发 watch cb，否则默认的触发依赖是立即执行的，相当于自定义了触发依赖
- 使用队列避免重复计算：当多个数据同时发生变化时，如果直接对每个变化都立即执行回调函数，可能会导致大量的重复计算。
- 通过使用微任务将 watch cb 的触发在 dom 更新之前，可以合并这些数据的变化，从而减少不必要的 dom 更新
