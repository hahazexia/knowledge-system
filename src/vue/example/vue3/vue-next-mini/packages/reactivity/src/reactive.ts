import { mutableHandlers } from "./baseHandlers";
import { isObject } from '@vue/shared';

export const enum ReactiveFlags {
  IS_REACTIVE = '__v_isReactive'
}

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

  proxy[ReactiveFlags.IS_REACTIVE] = true;

  // 缓存代理对象
  proxyMap.set(target, proxy);

  return proxy;
}

export const toReactive = <T extends unknown>(value: T): T => {
  return isObject(value) ? reactive(value as object) : value;
}

export function isReactive(value): boolean {
  return !!(value && value[ReactiveFlags.IS_REACTIVE]);
}