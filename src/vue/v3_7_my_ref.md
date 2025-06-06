# 实现 ref

```ts
import { hasChanged } from '@vue/shared';
import { createDep } from './dep';
import { activeEffect, trackEffects, triggerEffect } from './effect';
import { toReactive } from './reactive';

export interface Ref<T = any> {
  value: T;
}
/**
 * ref 函数
 * @param value unknown
 */
export function ref(value?: unknown) {
  return createRef(value, false);
}
/**
 * 创建 RefImpl 实例
 * @param rawValue 原始数据
 * @param shallow boolean 形数据，表示《浅层的响应性（即：只有 .value 是响应性的）》
 * @returns
 */
function createRef(rawValue: unknown, shallow: boolean) {
  if (isRef(rawValue)) {
    return rawValue;
  }

  return new RefImpl(rawValue, shallow);
}

class RefImpl<T> {
  private _value: T;
  private _rawValue: T;
  // 是否为 ref 类型数据的标记
  public readonly __v_isRef = true;

  // 如果 __v_isShallow 为 true，则 value 不会被转化为 reactive 数据，即如果当前 value 为复杂数据类型，则会失去响应性。对应官方文档 shallowRef ：https://cn.vuejs.org/api/reactivity-advanced.html#shallowref
  constructor(value: T, public readonly __v_isShallow: boolean) {
    // 原始数据
    this._rawValue = value;
    this._value = __v_isShallow ? value : toReactive(value);
  }

  get value() {
    // 收集依赖
    trackRefValue(this);
    return this._value;
  }

  set value(newVal) {
    /**
     * newVal 为新数据
     * this._rawValue 为旧数据（原始数据）
     * 对比两个数据是否发生了变化
     */
    if (hasChanged(newVal, this._rawValue)) {
      // 更新原始数据
      this._rawValue = newVal;
      // 更新 .value 的值
      this._value = toReactive(newVal);
      // 触发依赖
      triggerRefValue(this);
    }
  }
}

/**
 * 为 ref 的 value 进行依赖收集工作
 */
export function trackRefValue(ref) {
  if (activeEffect) {
    trackEffects(ref.dep || (ref.dep = createDep()));
  }
}

/**
 * 为 ref 的 value 进行触发依赖工作
 */
export function triggerRefValue(ref) {
  if (ref.dep) {
    triggerEffect(ref.dep);
  }
}

/**
 * 指定数据是否为 RefImpl 类型
 */
export function isRef(r: any): r is Ref {
  return !!(r && r.__v_isRef === true);
}
```

- ref 的意义是为了处理简单数据无法使用 Proxy 的情况，使用自定义类 RefImpl 的 get 和 set 属性来模拟 Proxy 的 getter 和 setter，实现响应式的效果。因此使用的时候必须使用 `.value` 来主动触发 getter 和 setter
- 而复杂数据的处理依然走 reactive 方法
