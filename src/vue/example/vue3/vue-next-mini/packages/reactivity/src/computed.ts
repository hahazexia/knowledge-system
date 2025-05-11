import { isFunction } from "@vue/shared";
import { ReactiveEffect } from "./effect";
import { Dep } from "./dep";
import { trackRefValue, triggerRefValue } from "./ref";

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