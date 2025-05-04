# 响应式源码

## reactive 源码跟踪

```js
const { reactive, effect } = Vue;

const obj = reactive({ name: '张三' });

effect(() => {
  document.querySelector('#app').innerHTML = obj.name;
});

setTimeout(() => {
  obj.name = '李四';
}, 2000);
```

reactive 源码有两条主线：

1. reactive 做了什么？
2. effect 是什么？

## reactive

1.  `packages\reactivity\src\reactive.ts` 触发 reactive 方法

    ````ts
    /**
     * Creates a reactive copy of the original object.
     *
     * The reactive conversion is "deep"—it affects all nested properties. In the
     * ES2015 Proxy based implementation, the returned proxy is **not** equal to the
     * original object. It is recommended to work exclusively with the reactive
     * proxy and avoid relying on the original object.
     *
     * A reactive object also automatically unwraps refs contained in it, so you
     * don't need to use `.value` when accessing and mutating their value:
     *
     * ```js
     * const count = ref(0)
     * const obj = reactive({
     *   count
     * })
     *
     * obj.count++
     * obj.count // -> 1
     * count.value // -> 1
     * ```
     */
    export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>;
    export function reactive(target: object) {
      // if trying to observe a readonly proxy, return the readonly version.
      if (isReadonly(target)) {
        return target;
      }
      return createReactiveObject(
        target,
        false,
        mutableHandlers,
        mutableCollectionHandlers,
        reactiveMap
      );
    }
    ````

2.  `packages\reactivity\src\reactive.ts` 调用 createReactiveObject 创建 reactive 对象

    ```ts
    function createReactiveObject(
      target: Target,
      isReadonly: boolean,
      baseHandlers: ProxyHandler<any>,
      collectionHandlers: ProxyHandler<any>,
      proxyMap: WeakMap<Target, any>
    ) {
      if (!isObject(target)) {
        if (__DEV__) {
          console.warn(`value cannot be made reactive: ${String(target)}`);
        }
        return target;
      }
      // target is already a Proxy, return it.
      // exception: calling readonly() on a reactive object
      if (
        target[ReactiveFlags.RAW] &&
        !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
      ) {
        return target;
      }
      // target already has corresponding Proxy
      const existingProxy = proxyMap.get(target);
      if (existingProxy) {
        return existingProxy;
      }
      // only specific value types can be observed.
      const targetType = getTargetType(target);
      if (targetType === TargetType.INVALID) {
        return target;
      }
      const proxy = new Proxy(
        target,
        targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
      );
      proxyMap.set(target, proxy);
      return proxy;
    }
    ```

3.  `createReactiveObject` 中进入 new Proxy

    - 第一个参数 target 被代理的原始对象
    - 第二个参数 handler targetType 是 1，TargetType.COLLECTION 是 2，所以 handler 为 baseHandlers

4.  `baseHandlers` 是传递给 `createReactiveObject` 的第三个参数 `mutableHandlers`

5.  `packages\reactivity\src\baseHandlers.ts` `mutableHandlers`定义，`mutableHandlers` 包含了 getter 和 setter 方法

    ```ts
    export const mutableHandlers: ProxyHandler<object> = {
      get,
      set,
      deleteProperty,
      has,
      ownKeys,
    };
    ```

6.  `createReactiveObject` 接着执行了 `proxyMap.set(target, proxy)` 存下被代理对象和代理对象到 map 中，接着返回了代理对象，这样 reactive 的执行就结束了

- 由以上得知，reactive 做了 3 件事
  1. 创建了 proxy
  2. 把 proxy 存到 proxyMap 里
  3. 返回 proxy

## effect

1. `packages\reactivity\src\effect.ts` effect 方法

   ```ts
   export function effect<T = any>(
     fn: () => T,
     options?: ReactiveEffectOptions
   ): ReactiveEffectRunner {
     if ((fn as ReactiveEffectRunner).effect) {
       fn = (fn as ReactiveEffectRunner).effect.fn;
     }

     const _effect = new ReactiveEffect(fn);
     if (options) {
       extend(_effect, options);
       if (options.scope) recordEffectScope(_effect, options.scope);
     }
     if (!options || !options.lazy) {
       _effect.run();
     }
     const runner = _effect.run.bind(_effect) as ReactiveEffectRunner;
     runner.effect = _effect;
     return runner;
   }
   ```

2. 执行了 `const _effect = new ReactiveEffect(fn);` ，其中 fn 就是我们传递给 effect 的匿名函数

   1. 这里的 `ReactiveEffect` 类，查看其内部，得知实现了 `run` 和 `stop` 方法

3. effect 方法接着执行了 ReactiveEffect 实例的 run 方法

   1. `activeEffect = this` activeEffect 为当前传入 fn 生成的 ReactiveEffect 实例
   2. 然后执行 `return this.fn()`，也就是执行传入的匿名函数，`() => {document.querySelector("#app").innerHTML = obj.name;}`

      ```ts
        run() {
          if (!this.active) {
            return this.fn()
          }
          let parent: ReactiveEffect | undefined = activeEffect
          let lastShouldTrack = shouldTrack
          while (parent) {
            if (parent === this) {
              return
            }
            parent = parent.parent
          }
          try {
            this.parent = activeEffect
            activeEffect = this
            shouldTrack = true

            trackOpBit = 1 << ++effectTrackDepth

            if (effectTrackDepth <= maxMarkerBits) {
              initDepMarkers(this)
            } else {
              cleanupEffect(this)
            }
            return this.fn()
          } finally {
            if (effectTrackDepth <= maxMarkerBits) {
              finalizeDepMarkers(this)
            }

            trackOpBit = 1 << --effectTrackDepth

            activeEffect = this.parent
            shouldTrack = lastShouldTrack
            this.parent = undefined

            if (this.deferStop) {
              this.stop()
            }
          }
        }
      ```

4. 这时 `() => {document.querySelector("#app").innerHTML = obj.name;}` 执行的时候，以为 obj 是 proxy，会执行 obj.name 会触发 getter，会执行 `mutableHandlers` 的 getter

   1. getter 中会触发 `const res = Reflect.get(target, key, receiver)`，这时候获取到的 res 是 `张三`
   2. 然后会触发 `track(target, TrackOpTypes.GET, key)`

      ```ts
      function createGetter(isReadonly = false, shallow = false) {
        return function get(
          target: Target,
          key: string | symbol,
          receiver: object
        ) {
          if (key === ReactiveFlags.IS_REACTIVE) {
            return !isReadonly;
          } else if (key === ReactiveFlags.IS_READONLY) {
            return isReadonly;
          } else if (key === ReactiveFlags.IS_SHALLOW) {
            return shallow;
          } else if (
            key === ReactiveFlags.RAW &&
            receiver ===
              (isReadonly
                ? shallow
                  ? shallowReadonlyMap
                  : readonlyMap
                : shallow
                ? shallowReactiveMap
                : reactiveMap
              ).get(target)
          ) {
            return target;
          }

          const targetIsArray = isArray(target);

          if (
            !isReadonly &&
            targetIsArray &&
            hasOwn(arrayInstrumentations, key)
          ) {
            return Reflect.get(arrayInstrumentations, key, receiver);
          }

          const res = Reflect.get(target, key, receiver);

          if (
            isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)
          ) {
            return res;
          }

          if (!isReadonly) {
            track(target, TrackOpTypes.GET, key);
          }

          if (shallow) {
            return res;
          }

          if (isRef(res)) {
            // ref unwrapping - skip unwrap for Array + integer key.
            return targetIsArray && isIntegerKey(key) ? res : res.value;
          }

          if (isObject(res)) {
            // Convert returned value into a proxy as well. we do the isObject check
            // here to avoid invalid value warning. Also need to lazy access readonly
            // and reactive here to avoid circular dependency.
            return isReadonly ? readonly(res) : reactive(res);
          }

          return res;
        };
      }
      ```

5. track 函数是重点。

   1. 回想 3-1 的时候，activeEffect 为当前传入 fn 生成的 ReactiveEffect 实例
   2. 首先为 targetMap 设置值，key 是被代理对象（{name: '张三'}），value 是 depsMap，一个新的 map
   3. depsMap 也设置值，key 是被代理对象的属性 name，value 是 createDep 创建的一个 set
   4. 接着执行 `trackEffects(dep, eventInfo)`，其中 eventInfo 是一个包含 4 个属性的对象，其中 effect 属性就是 activeEffect，也就是传入匿名函数生成的 ReactiveEffect 实例
   5. trackEffects 内部做了两件事，为 dep（`targetMap[target][key]` 得到的 set 实例）添加 activeEffect 函数；为 activeEffect 函数的静态属性 deps 增加一个值 dep
   6. 这里做的事情就是建立 dep 和 activeEffect 的联系，当响应对象的属性发生变化的时候，就可以通过 targetMap 找到对应联系的 ReactiveEffect 然后去执行

   ```ts
   export function track(target: object, type: TrackOpTypes, key: unknown) {
     if (shouldTrack && activeEffect) {
       let depsMap = targetMap.get(target);
       if (!depsMap) {
         targetMap.set(target, (depsMap = new Map()));
       }
       let dep = depsMap.get(key);
       if (!dep) {
         depsMap.set(key, (dep = createDep()));
       }

       const eventInfo = __DEV__
         ? { effect: activeEffect, target, type, key }
         : undefined;

       trackEffects(dep, eventInfo);
     }
   }

   export function trackEffects(
     dep: Dep,
     debuggerEventExtraInfo?: DebuggerEventExtraInfo
   ) {
     let shouldTrack = false;
     if (effectTrackDepth <= maxMarkerBits) {
       if (!newTracked(dep)) {
         dep.n |= trackOpBit; // set newly tracked
         shouldTrack = !wasTracked(dep);
       }
     } else {
       // Full cleanup mode.
       shouldTrack = !dep.has(activeEffect!);
     }

     if (shouldTrack) {
       dep.add(activeEffect!);
       activeEffect!.deps.push(dep);
       if (__DEV__ && activeEffect!.onTrack) {
         activeEffect!.onTrack({
           effect: activeEffect!,
           ...debuggerEventExtraInfo!,
         });
       }
     }
   }
   ```

6. createGetter 最后返回了 res 值，即 `张三`，effect 执行完成

- effect 主要做了 3 件事情
  1. 生成传入匿名函数的 ReactiveEffect 实例
  2. 触发匿名函数 fn 激活 getter
  3. getter 中建立 targetMap 和 ReactiveEffect 的联系
     1. dep.add(activeEffect)
     2. activeEffect.deps.push(dep)

## 触发 setter

1. 2 秒之后触发 setter，`packages\reactivity\src\baseHandlers.ts` 的 createSetter 函数。

   ```ts
   function createSetter(shallow = false) {
     return function set(
       target: object,
       key: string | symbol,
       value: unknown,
       receiver: object
     ): boolean {
       let oldValue = (target as any)[key];
       if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) {
         return false;
       }
       if (!shallow && !isReadonly(value)) {
         if (!isShallow(value)) {
           value = toRaw(value);
           oldValue = toRaw(oldValue);
         }
         if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
           oldValue.value = value;
           return true;
         }
       } else {
         // in shallow mode, objects are set as-is regardless of reactive or not
       }

       const hadKey =
         isArray(target) && isIntegerKey(key)
           ? Number(key) < target.length
           : hasOwn(target, key);
       const result = Reflect.set(target, key, value, receiver);
       // don't trigger if target is something up in the prototype chain of original
       if (target === toRaw(receiver)) {
         if (!hadKey) {
           trigger(target, TriggerOpTypes.ADD, key, value);
         } else if (hasChanged(value, oldValue)) {
           trigger(target, TriggerOpTypes.SET, key, value, oldValue);
         }
       }
       return result;
     };
   }
   ```

2. oldValue 是 `张三`，value 是 `李四`，执行 `const result = Reflect.set(target, key, value, receiver);` 修改 obj.name 为 `李四`，然后触发 `trigger(target, TriggerOpTypes.SET, key, value, oldValue);`，这时候 trigger 的参数为：

   1. target {name: '李四'}
   2. key 'name'
   3. value '李四'
   4. oldValue '张三'

3. trigger 重点函数。

   1. `const depsMap = targetMap.get(target);` 首先找到 targetMap 中的数据，然后 `deps.push(depsMap.get(key));` 获取到 set 实例，然后触发 `triggerEffects(deps[0], eventInfo);`
   2. triggerEffects 遍历了 set 实例，然后为每个 fn 函数触发 triggerEffect，最终调用了 ReactiveEffect 实例的 run 方法。run 方法中为 `activeEffect = this` 设置 activeEffect 为当前 reactiveEffect 实例，然后调用了 this.fn()。这时 `() => {document.querySelector("#app").innerHTML = obj.name;}` 执行，页面的内容变成 `李四`

      ```ts
      export function trigger(
        target: object,
        type: TriggerOpTypes,
        key?: unknown,
        newValue?: unknown,
        oldValue?: unknown,
        oldTarget?: Map<unknown, unknown> | Set<unknown>
      ) {
        const depsMap = targetMap.get(target);
        if (!depsMap) {
          // never been tracked
          return;
        }

        let deps: (Dep | undefined)[] = [];
        if (type === TriggerOpTypes.CLEAR) {
          // collection being cleared
          // trigger all effects for target
          deps = [...depsMap.values()];
        } else if (key === 'length' && isArray(target)) {
          depsMap.forEach((dep, key) => {
            if (key === 'length' || key >= (newValue as number)) {
              deps.push(dep);
            }
          });
        } else {
          // schedule runs for SET | ADD | DELETE
          if (key !== void 0) {
            deps.push(depsMap.get(key));
          }

          // also run for iteration key on ADD | DELETE | Map.SET
          switch (type) {
            case TriggerOpTypes.ADD:
              if (!isArray(target)) {
                deps.push(depsMap.get(ITERATE_KEY));
                if (isMap(target)) {
                  deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                }
              } else if (isIntegerKey(key)) {
                // new index added to array -> length changes
                deps.push(depsMap.get('length'));
              }
              break;
            case TriggerOpTypes.DELETE:
              if (!isArray(target)) {
                deps.push(depsMap.get(ITERATE_KEY));
                if (isMap(target)) {
                  deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                }
              }
              break;
            case TriggerOpTypes.SET:
              if (isMap(target)) {
                deps.push(depsMap.get(ITERATE_KEY));
              }
              break;
          }
        }

        const eventInfo = __DEV__
          ? { target, type, key, newValue, oldValue, oldTarget }
          : undefined;

        if (deps.length === 1) {
          if (deps[0]) {
            if (__DEV__) {
              triggerEffects(deps[0], eventInfo);
            } else {
              triggerEffects(deps[0]);
            }
          }
        } else {
          const effects: ReactiveEffect[] = [];
          for (const dep of deps) {
            if (dep) {
              effects.push(...dep);
            }
          }
          if (__DEV__) {
            triggerEffects(createDep(effects), eventInfo);
          } else {
            triggerEffects(createDep(effects));
          }
        }
      }

      export function triggerEffects(
        dep: Dep | ReactiveEffect[],
        debuggerEventExtraInfo?: DebuggerEventExtraInfo
      ) {
        // spread into array for stabilization
        const effects = isArray(dep) ? dep : [...dep];
        for (const effect of effects) {
          if (effect.computed) {
            triggerEffect(effect, debuggerEventExtraInfo);
          }
        }
        for (const effect of effects) {
          if (!effect.computed) {
            triggerEffect(effect, debuggerEventExtraInfo);
          }
        }
      }

      function triggerEffect(
        effect: ReactiveEffect,
        debuggerEventExtraInfo?: DebuggerEventExtraInfo
      ) {
        if (effect !== activeEffect || effect.allowRecurse) {
          if (__DEV__ && effect.onTrigger) {
            effect.onTrigger(extend({ effect }, debuggerEventExtraInfo));
          }
          if (effect.scheduler) {
            effect.scheduler();
          } else {
            effect.run();
          }
        }
      }
      ```

- setter 主要做了 2 件事
  1. 修改 obj.name 的值
  2. 通过之前 getter 收集到的关系（保存在 targetMap 中）找到对应的 reactiveEffect 然后执行对应的匿名函数

## 总结

1. 创建 proxy
   - 生成代理对象 proxy，并且设置 proxy 的 getter 和 setter
2. 收集 effect 依赖
   - effect 中创建 ReactiveEffect 对象，执行 fn，触发 proxy 的 getter，getter 中收集依赖，建立当前 ReactiveEffect 与指定`被代理对象`的`指定属性`之间的关系。
3. 触发收集的依赖
   - 当改变代理对象的属性的时候，触发 setter，通过刚才收集到的依赖，很容易的找到指定`被代理对象`的`指定属性`对应的 ReactiveEffect 对象，直接触发 ReactiveEffect 上的 fn 也就是执行之前传递给 effect 的匿名函数
