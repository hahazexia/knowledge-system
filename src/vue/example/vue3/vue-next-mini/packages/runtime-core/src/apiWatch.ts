import { EMPTY_OBJ, hasChanged, isObject } from "@vue/shared";
import { ReactiveEffect } from "packages/reactivity/src/effect";
import { isReactive } from "packages/reactivity/src/reactive";
import { queuePreFlushCb } from "./scheduler";

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
  {immediate, deep}: WatchOptions = EMPTY_OBJ,
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
      oldValue = effect.run()
    }
  } else {
    effect.run();
  }

  return () => {
    effect.stop();
  }
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