# ref 源码

## ref 源码跟踪

```js
const { ref, effect } = Vue;

const obj1 = ref({ name: '张三' });

effect(() => {
  document.querySelector('#app1').innerHTML = obj1.value.name;
});

setTimeout(() => {
  obj1.value.name = '李四';
}, 2000);

const obj2 = ref('张三');

effect(() => {
  document.querySelector('#app2').innerHTML = obj2.value;
});

setTimeout(() => {
  obj2.value = '李四';
}, 2000);
```

## ref

1. `packages\reactivity\src\ref.ts` ref 最终返回了一个 RefImpl 实例

   ```ts
   export function ref(value?: unknown) {
     return createRef(value, false);
   }

   export function isRef(r: any): r is Ref {
     return !!(r && r.__v_isRef === true);
   }

   function createRef(rawValue: unknown, shallow: boolean) {
     if (isRef(rawValue)) {
       return rawValue;
     }
     return new RefImpl(rawValue, shallow);
   }
   ```

2. RefImpl 类

   - 这里的实现可以发现，如果传入的数据是对象，那么会直接调用 toReactive，其本质就是 reactive 方法
   - class 的 get 和 set 就是实例的 getter 和 setter

   ```ts
   class RefImpl<T> {
     private _value: T;
     private _rawValue: T;

     public dep?: Dep = undefined;
     public readonly __v_isRef = true;

     constructor(value: T, public readonly __v_isShallow: boolean) {
       // _rawValue 原始数据
       this._rawValue = __v_isShallow ? value : toRaw(value);
       // _value 如果是对象，用 reactive 来处理响应式
       this._value = __v_isShallow ? value : toReactive(value);
     }

     // 实例的 getter
     get value() {
       trackRefValue(this);
       return this._value;
     }
     // 实例的 setter
     set value(newVal) {
       newVal = this.__v_isShallow ? newVal : toRaw(newVal);
       if (hasChanged(newVal, this._rawValue)) {
         this._rawValue = newVal;
         this._value = this.__v_isShallow ? newVal : toReactive(newVal);
         triggerRefValue(this, newVal);
       }
     }
   }
   ```

3. effect 中的匿名函数执行，会触发实例的 getter，调用 `trackRefValue(this);`，trackRefValue 会调用 trackEffects，之前 reactive 中收集依赖也是 trackEffects 这个方法，其中会执行 `dep.add(activeEffect!)` 完成依赖收集

   - 先触发 1 次 RefImpl 的 get
   - 再触发 1 次 ReactiveEffect 的 getter

   ```ts
   export function trackRefValue(ref: RefBase<any>) {
     if (shouldTrack && activeEffect) {
       ref = toRaw(ref);
       if (__DEV__) {
         trackEffects(ref.dep || (ref.dep = createDep()), {
           target: ref,
           type: TrackOpTypes.GET,
           key: 'value',
         });
       } else {
         trackEffects(ref.dep || (ref.dep = createDep()));
       }
     }
   }
   ```

4. 接着给 ref 变量设置值的时候

   - 先触发 1 次 RefImpl 的 getter（这一次没有 activeEffect，所以什么都不会做）
   - 接着再触发 1 次 ReactiveEffect 的 setter，完成依赖的触发

     ```ts
     setTimeout(() => {
       obj.value.name = '李四';
     }, 2000);
     ```

## 总结

- 当传递给 ref 的是复杂类型的时候，响应性的实现还依然走的是 reactive，但是生成的 proxy 挂在了 RefImpl 的 value 属性上；当传递给 ref 是简单类型的时候，依赖收集和触发依靠的是 RefImpl 实例的 value 属性的 getter 和 setter。所以不论是简单数据还是复杂数据，ref 的响应式都需要通过 value 属性来触发。
  - 复杂数据是因为生成的 proxy 在 RefImpl 实例的 value 属性上，复杂数据的依赖收集和触发依然走的是 proxy 的逻辑
  - 简单数据是因为 RefImpl 实例的 value 属性的 getter 和 setter 负责简单数据的依赖收集和依赖触发
