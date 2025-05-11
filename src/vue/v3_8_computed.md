# computed 源码

- 计算属性 computed 会基于其响应式依赖被缓存，并且在依赖的响应式数据发生变化时重新计算

```html
<script>
  const { reactive, effect, computed } = Vue;

  const obj = reactive({
    name: '张三',
  });

  const computedObj = computed(() => {
    return '姓名： ' + obj.name;
  });

  effect(() => {
    document.querySelector('#app').innerText = computedObj.value;
  });

  setTimeout(() => {
    obj.name = '李四';
  }, 2000);
</script>
```

## coumputed

1. computed 调用后，我们传递给 computed 的函数被设置为 getter，setter 没有设置是空函数，然后创建 ComputedRefImpl 实例

   ```ts
   export function computed<T>(
     getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
     debugOptions?: DebuggerOptions,
     isSSR = false
   ) {
     let getter: ComputedGetter<T>;
     let setter: ComputedSetter<T>;

     const onlyGetter = isFunction(getterOrOptions);
     if (onlyGetter) {
       // 传递给 computed 的函数被设置为 getter
       getter = getterOrOptions;
       // setter 没有设置是空函数
       setter = __DEV__
         ? () => {
             console.warn('Write operation failed: computed value is readonly');
           }
         : NOOP;
     } else {
       getter = getterOrOptions.get;
       setter = getterOrOptions.set;
     }

     // 创建 ComputedRefImpl 实例
     const cRef = new ComputedRefImpl(
       getter,
       setter,
       onlyGetter || !setter,
       isSSR
     );

     if (__DEV__ && debugOptions && !isSSR) {
       cRef.effect.onTrack = debugOptions.onTrack;
       cRef.effect.onTrigger = debugOptions.onTrigger;
     }

     return cRef as any;
   }
   ```

2. 创建 ComputedRefImpl 实例

   ```ts
   export class ComputedRefImpl<T> {
     // dep属性 是一个 set 数组，里面存放的都是收集到的 reactiveEffect 依赖，和之前的 refImpl 类一样
     public dep?: Dep = undefined;

     private _value!: T;
     public readonly effect: ReactiveEffect<T>;

     // ref 标识符为 true
     public readonly __v_isRef = true;
     public readonly [ReactiveFlags.IS_READONLY]: boolean;

     // 脏变量为 true（有重要作用）
     public _dirty = true;
     public _cacheable: boolean;

     constructor(
       getter: ComputedGetter<T>,
       private readonly _setter: ComputedSetter<T>,
       isReadonly: boolean,
       isSSR: boolean
     ) {
       // 新建了一个 ReactiveEffect，第一个参数 getter 就是传递给 computed 的函数，也就是说传递给 computed 的函数和使用 effect api 时候传递给 effect 的函数是一样的效果，就是依赖触发时的 fn
       this.effect = new ReactiveEffect(getter, () => {
         // 判断脏变量如果不是 true，就让脏变量变成 true，然后触发依赖
         // 因此可以得知 _dirty 脏变量用来控制什么时候触发依赖
         if (!this._dirty) {
           this._dirty = true;
           triggerRefValue(this);
         }
       });
       this.effect.computed = this;
       this.effect.active = this._cacheable = !isSSR;
       this[ReactiveFlags.IS_READONLY] = isReadonly;
     }

     get value() {
       // the computed ref may get wrapped by other proxies e.g. readonly() #3376
       const self = toRaw(this);
       trackRefValue(self);
       if (self._dirty || !self._cacheable) {
         self._dirty = false;
         self._value = self.effect.run()!;
       }
       return self._value;
     }

     set value(newValue: T) {
       this._setter(newValue);
     }
   }
   ```

3. 接着走到 `effect(() => {document.querySelector('#app').innerText = computedObj.value;});`， 会触发 ComputedRefImpl 的 getter

   ```ts
   export class ComputedRefImpl<T> {
     // dep属性 是一个 set 数组，里面存放的都是收集到的 reactiveEffect 依赖，和之前的 refImpl 类一样
     public dep?: Dep = undefined;

     private _value!: T;
     public readonly effect: ReactiveEffect<T>;

     // ref 标识符为 true
     public readonly __v_isRef = true;
     public readonly [ReactiveFlags.IS_READONLY]: boolean;

     // 脏变量为 true（有重要作用）
     public _dirty = true;
     public _cacheable: boolean;

     constructor(
       getter: ComputedGetter<T>,
       private readonly _setter: ComputedSetter<T>,
       isReadonly: boolean,
       isSSR: boolean
     ) {
       // 新建了一个 ReactiveEffect，第一个参数 getter 就是传递给 computed 的函数，也就是说传递给 computed 的函数和使用 effect api 时候传递给 effect 的函数是一样的效果，就是依赖触发时的 fn
       this.effect = new ReactiveEffect(getter, () => {
         // 判断脏变量如果不是 true，就让脏变量变成 true，然后触发依赖
         // 因此可以得知 _dirty 脏变量用来控制什么时候触发依赖
         if (!this._dirty) {
           this._dirty = true;
           triggerRefValue(this);
         }
       });
       this.effect.computed = this;
       this.effect.active = this._cacheable = !isSSR;
       this[ReactiveFlags.IS_READONLY] = isReadonly;
     }

     get value() {
       // the computed ref may get wrapped by other proxies e.g. readonly() #3376
       const self = toRaw(this);
       // trackRefValue 收集依赖，使当前 effect 的匿名函数对应的 reactiveEffect 与当前 ComputedRefImpl 实例建立联系，类似 ref api 的逻辑
       trackRefValue(self);
       // getter 触发的时候，如果脏状态为 true，说明是依赖收集阶段，这里已经收集完成，将脏状态变为 false
       if (self._dirty || !self._cacheable) {
         self._dirty = false;
         // 执行传递给 computed 的函数，第一次获取到计算属性的值存到 _value 里
         // 传递给 computed 的函数是 () => {return '姓名： ' + obj.name;}，执行的时候又会触发 reactive 对象 obj 的 getter，然后进行 obj 这个 reactive 对象的依赖收集
         self._value = self.effect.run()!;
       }
       return self._value;
     }

     set value(newValue: T) {
       this._setter(newValue);
     }
   }
   ```

## 总结

- 先通过 proxy 创建 reactive 对象 obj
- computed 计算属性，内部创建 computedRefImpl 实例，包含一个 effect 属性是一个 reactiveEffect 实例，fn 就是传给 computed 的函数，这里需要重点注意 computedRefImpl 的 reactiveEffect 实例传递了第二个参数是个匿名函数，这第二个参数就是 scheduler，用于最后触发依赖的时候有用
- effect 语句执行，也创建了一个 reactiveEffect 实例，最后执行 effect 的 fn，会触发 computedRefImpl 的 getter，getter 会调用 trackRefValue 收集依赖。这时是建立 computedRefImpl 这个 ref 对象和 effect 的 reactiveEffect 实例之间的关联，computedRefImpl 的 dep 属性（set 数组）中就会包含 effect 的 reactiveEffect 实例
- computedRefImpl 的依赖收集完成后（dep 中包含 effect 的 reactiveEffect），返回第一次 computed 计算结果
- 返回第一次 computed 计算结果的时候，因为使用了 obj.name，因此会触发 obj proxy 的 getter 收集依赖，这时候 activeEffect 是 computedRefImpl 的 reactiveEffect，于是 computedRefImpl 的 reactiveEffect 被加入到 obj 的 dep 中。
- computed 计算的结果，这个结果赋值给 app div 的 innerText，effect 就执行结束了，这时候页面上显示 姓名：张三
- 定时器过 2 秒后修改 obj.name 为 李四，触发 obj 的 setter，setter 中除了修改 obj.name 的值为新值 李四，还会去触发依赖，也就是 computedRefImpl 的 reactiveEffect，这时候就不会执行 fn 了，而是判断是否有 scheduler，如果有 scheduler 就说明是计算属性，会触发 scheduler（computedRefImpl 的 reactiveEffect 实例传递的第二个参数是个匿名函数）
- scheduler 判断 dirty，然后调用 triggerRefValue，这时候会找到 computedRefImpl 实例的 dep 依赖，然后触发，最终调用的是 effect 的 fn，这时候 effect 的 fn 里的逻辑会拿到最新的 computed 值 李四

简化：

- effect 触发 computedRefImpl 的 getter，computedRefImpl 实例收集依赖，和 effect 的 reactiveEffect 建立联系
- computed 计算值的时候触发 reactive 变量的 proxy getter，reactive 变量收集依赖，和 computedRefImpl 的 reactiveEffect 建立联系
- reactive 变量 setter 触发，联动会触发 computedRefImpl 的 reactiveEffect，执行 computedRefImpl 的 scheduler，scheduler 会将 dirty 变为 true，下一次 getter 获取值的时候就会重新计算最新的 computed 值，scheduler 会找到 computedRefImpl 收集的依赖中的 effect 的 reactiveEffect，最后执行的是 effect 函数，
