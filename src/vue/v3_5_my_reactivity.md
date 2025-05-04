# 实现 reactivity

## WeakMap

- Map 和 WeakMap 都是 key-value 形式的对象，它们的区别有 2 点

  1. WeakMap 的 key 必须是对象
  2. key 是弱引用的

- 弱引用：不会影响垃圾回收机制。即 WeakMap 的 key 不存在任何引用时，会被立即回收
- 强引用：影响垃圾回收机制。存在强引用的对象永远不会被回收

```js
let obj = {
  name: "张三",
};

const map = new Map();

map.set(obj, "value");

obj = null;

// obj 是堆内存中的数据，当设置为 null 时，理应被垃圾回收，但是因为 Map 是强引用，因此不会被回收，依然存在

// 如果将 Map 改为 WeakMap，obj 将被回收，并且 map 变量也没有值了
```

- 这就是 vue 使用 WeakMap 的原因，比如 `proxyMap.set(target, proxy);`，当 proxyMap 中的被代理对象 target 不存在了，那么代理对象 proxy 就会被自动清除，以达到内存的优化

## 如何进行依赖收集

- 响应式其实就是当触发 setter 的时候执行对应的 effect 函数，因此要在第一次执行 effect 函数触发 getter 的时候收集到 effect 函数，以便建立联系，才能在 setter 触发的时候找到对应的函数
- 而且收集的时候，不仅仅只是收集函数，还要与指定的被代理对象的指定属性建立对应的关系，这样才能在这个属性触发 setter 的时候，触发对应的函数

- 因此收集依赖，可以利用一个 WeakMap
  - key 是被代理对象
  - value 是 Map 对象
    - key 是被代理对象的指定属性
    - value 被代理对象指定属性的 effect 函数生成的 ReactiveEffect 实例 组成的数组（这样可以实现一个属性对应多个 effect 函数）

## reactive.ts

```ts
import { mutableHandlers } from "./baseHandlers";

/**
 * 响应性 Map 缓存对象
 * key：target
 * val：proxy
 */
export const reactiveMap = new WeakMap<object, any>();

/**
 * 为复杂数据类型，创建响应性对象
 * @param target 被代理对象
 * @returns 代理对象
 */
export function reactive(target: object) {
  return createReactiveObject(target, mutableHandlers, reactiveMap);
}

/**
 * 创建响应性对象
 * @param target 被代理对象
 * @param baseHandlers handler
 */
function createReactiveObject(
  target: object,
  baseHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<object, any>
) {
  // 如果该实例已经被代理，则直接读取即可
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  // 未被代理则生成 proxy 实例
  const proxy = new Proxy(target, baseHandlers);

  // 缓存代理对象
  proxyMap.set(target, proxy);

  return proxy;
}
```

## baseHandlers.ts

```ts
import { track, trigger } from "./effect";

/**
 * getter 方法
 */
const get = createGetter();

function createGetter() {
  return function get(target: object, key: string | symbol, receiver: object) {
    // 利用 Reflect 得到返回值
    const res = Reflect.get(target, key, receiver);
    // 收集依赖
    track(target, key);
    return res;
  };
}

/**
 * setter 方法
 */
const set = createSetter();

function createSetter() {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ) {
    // 利用 Reflect.set 设置新值
    const result = Reflect.set(target, key, value, receiver);
    // 触发依赖
    trigger(target, key, value);
    return result;
  };
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
};
```

## effect.ts

```ts
import { isArray } from "@vue/shared";
import { createDep, Dep } from "./dep";

type KeyToDepMap = Map<any, Dep>;
/**
 * 收集所有依赖的 WeakMap 实例：
 * 1. `key`：响应性对象
 * 2. `value`：`Map` 对象
 * 		1. `key`：响应性对象的指定属性
 * 		2. `value`：指定对象的指定属性的执行函数生成的 ReactiveEffect 实例组成的 Set 数组
 */
const targetMap = new WeakMap<any, KeyToDepMap>();

export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn);

  _effect.run();
}

export let activeEffect: ReactiveEffect | undefined;

export class ReactiveEffect<T = any> {
  constructor(public fn: () => T) {}

  run() {
    activeEffect = this;
    return this.fn();
  }
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
  if (!dep) {
    {
      depsMap.set(key, (dep = createDep()));
    }
  }

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
  trackEffects(dep);
}

/**
 * 依次触发 dep 中保存的依赖
 */
export function triggerEffects(dep: Dep) {
  // 把 dep 构建为一个数组
  const effects = isArray(dep) ? dep : [...dep];

  // 依次触发
  for (const effect of effects) {
    triggerEffect(effect);
  }
}

/**
 * 触发指定的依赖
 */
export function triggerEffect(effect: ReactiveEffect) {
  effect.fn();
}
```

## dep.ts

```ts
import { ReactiveEffect } from "./effect";

export type Dep = Set<ReactiveEffect>;

/**
 * 依据 effects 生成 dep 实例
 */
export const createDep = (effects?: ReactiveEffect[]): Dep => {
  const dep = new Set<ReactiveEffect>(effects) as Dep;
  return dep;
};
```
