import { extend, isArray } from '@vue/shared';
import { createDep, Dep } from "./dep";
import { ComputedRefImpl } from './computed';

export type EffectScheduler = (...arg: any) => any;

type KeyToDepMap = Map<any, Dep>;
/**
 * 收集所有依赖的 WeakMap 实例：
 * 1. `key`：响应性对象
 * 2. `value`：`Map` 对象
 * 		1. `key`：响应性对象的指定属性
 * 		2. `value`：指定对象的指定属性的执行函数生成的 ReactiveEffect 实例组成的 Set 数组
 */
const targetMap = new WeakMap<any, KeyToDepMap>();

export interface ReactiveEffectOptions {
  lazy?: boolean;
  scheduler?: EffectScheduler;
}

export function effect<T = any>(fn: () => T, options?: ReactiveEffectOptions) {
  const _effect = new ReactiveEffect(fn);

  if (options) {
    extend(_effect, options);
  }

  if (!options || !options.lazy) {
    _effect.run();
  }
}

export let activeEffect: ReactiveEffect | undefined;

export class ReactiveEffect<T = any> {

  computed ?: ComputedRefImpl<T>;
  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null
  ) {}

  run() {
    activeEffect = this;
    return this.fn();
  }

  stop() {}
}

/**
 * 用于收集依赖的方法
 * @param target WeakMap 的 key
 * @param key 代理对象的 key，当依赖被触发时，需要根据该 key 获取
 */
export function track(target: object, key: unknown) {
  // 如果当前不存在执行函数，则直接 return
  if (!activeEffect) return;

  // 尝试从 targetMap 中，根据 target 获取 map
  let depsMap = targetMap.get(target);
  // 如果获取到的 map 不存在，则生成新的 map 对象，并把该对象赋值给对应的 value
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()));
  }

  // 获取指定 key 的 dep
  let dep = depsMap.get(key);
  // 如果 dep 不存在，则生成一个新的 dep，并放入到 depsMap 中
  if (!dep) {{
    depsMap.set(key, (dep = createDep()));
  }}

  trackEffects(dep);
}

/**
 * 利用 dep 依次跟踪指定 key 的所有 effect
 * @param dep
 */
export function trackEffects(dep: Dep) {
  // activeEffect! ： 断言 activeEffect 不为 null
  dep.add(activeEffect!);
}

/**
 * 触发依赖的方法
 * @param target WeakMap 的 key
 * @param key 代理对象的 key，当依赖被触发时，需要根据该 key 获取
 */
export function trigger(target: object, key: unknown, newValue: unknown) {
  // 依据 target 获取存储的 map 实例
  const depsMap = targetMap.get(target);
  // 如果 map 不存在，则直接 return
  if (!depsMap) {
    return;
  }

  // 依据指定的 key，获取 dep 实例
  const dep = depsMap.get(key) as Dep;
  // dep 不存在则直接 return
  if (!dep) {
    return;
  }

  // 触发 dep
  triggerEffects(dep);
}

/**
 * 触发 dep 中保存的依赖
 */
export function triggerEffects(dep: Dep) {
  // 把 dep 构建为一个数组
   const effects = isArray(dep) ? dep : [...dep];

   // 依次触发
  //  for (const effect of effects) {
  //   triggerEffect(effect);
  //  }
  // 当 effect 里有两次使用 computed 变量，就会让 computedRefImpl 收集到两个依赖，第一个是 effect 的 reactiveEffect，第二个就是 computedRefImpl 自己的 reactiveEffect。当触发更新的时候，按照顺序执行，就会陷入无限循环。因为最开始先执行 computedRefImpl.reactiveEffect 会将 dirty 变成 true，然后再通过 computedRefImpl.dep 顺序执行两个依赖，第一先执行 effect.reactiveEffect 的时候会触发 computedRefImpl.getter，将 dirty 重新变成 false，然后第二再执行 computedRefImpl.reactiveEffect 这时候 dirty 是 false，又会重新找到 computedRefImpl.dep 两个依赖再次执行，无限循环。

  // 所以修改成先优先执行 computedRefImpl.reactiveEffect, 这样的话因为还没有执行 effect.reactiveEffect 触发 computedRefImpl.getter 去改变 dirty 的值，dirty 就不会变成 false，因此碰到第二次 computedRefImpl.reactiveEffect 的时候，会跳过，避免了无限循环
   for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect);
    }
   }
   for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect);
    }
   }
}


/**
 * 触发指定的依赖
 */
export function triggerEffect(effect: ReactiveEffect) {
  if (effect.scheduler) {
    effect.scheduler();
  } else {
    effect.run();
  }
}

