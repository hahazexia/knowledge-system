# 实现 computed

## computed.ts

```ts
import { isFunction } from '@vue/shared';
import { ReactiveEffect } from './effect';
import { Dep } from './dep';
import { trackRefValue, triggerRefValue } from './ref';

export class ComputedRefImpl<T> {
  public dep?: Dep = undefined;
  private _value!: T;

  public readonly effect: ReactiveEffect<T>;

  public readonly __v_isRef = true;
  /**
   * 脏：为 false 时，表示需要触发依赖。为 true 时表示需要重新执行 run 方法，获取数据。即：数据脏了
   */
  public _dirty = true;

  constructor(getter) {
    this.effect = new ReactiveEffect(getter, () => {
      // 判断当前脏的状态，如果为 false，表示需要《触发依赖》
      if (!this._dirty) {
        // 将脏置为 true，表示需要重新计算 computed 变量
        this._dirty = true;
        triggerRefValue(this);
      }
    });
    this.effect.computed = this;
  }

  get value() {
    // 收集依赖
    trackRefValue(this);
    // 判断当前脏的状态，如果为 true ，则表示需要重新执行 run，获取最新数据
    if (this._dirty) {
      this._dirty = false;
      // 执行 run 重新计算
      this._value = this.effect.run();
    }
    // 返回计算之后的真实值
    return this._value;
  }
}

export function computed(getterOrOptions) {
  let getter;
  // 判断传入的参数是否为一个函数
  let onlyGetter = isFunction(getterOrOptions);
  // 如果是函数，则赋值给 getter
  if (onlyGetter) {
    getter = getterOrOptions;
  }

  const cRef = new ComputedRefImpl(getter);

  return cRef;
}
```

## triggerEffects 改变执行顺序解决无限循环问题

```ts
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
```
