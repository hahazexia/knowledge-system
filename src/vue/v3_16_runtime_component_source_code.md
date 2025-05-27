# runtime component 源码

```html
<script>
  // 无状态组件
  const { h, render } = Vue;

  const component = {
    render() {
      return h('div', 'hello component');
    },
  };

  const vnode = h(component);

  render(vnode, document.querySelector('#app'));
</script>
<script>
  // 有状态组件
  const { h, render } = Vue;

  const component = {
    data() {
      return {
        msg: 'hello, component',
      };
    },
    render() {
      return h('div', this.msg);
    },
  };

  const vnode = h(component);

  render(vnode, document.querySelector('#app'));
</script>
<script>
  // 生命周期
  const { h, render } = Vue;

  const component = {
    data() {
      return {
        msg: 'hello, component',
      };
    },
    render() {
      return h('div', this.msg);
    },
    beforeCreate() {
      alert('beforeCreate');
    },
    create() {
      alert('create');
    },
    beforeMount() {
      alert('beforeMount');
    },
    mounted() {
      alert('mounted');
    },
  };

  const vnode = h(component);

  render(vnode, document.querySelector('#app'));
</script>

<script>
  // 生命周期
  const { h, render, reactive } = Vue;

  const component = {
    setup() {
      const obj = reactive({
        name: '张三',
      });

      return () => h('div', obj.name);
    },
  };

  const vnode = h(component);

  render(vnode, document.querySelector('#app'));
</script>
```

- patch，这时候 n2 的 type 是一个包含 render 属性的对象，最后调用 processComponent

  ```ts
  const patch: PatchFn = (
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null,
    parentSuspense = null,
    isSVG = false,
    slotScopeIds = null,
    optimized = __DEV__ && isHmrUpdating ? false : !!n2.dynamicChildren
  ) => {
    if (n1 === n2) {
      return;
    }

    // 当无状态组件更新的时候，先卸载旧的，再挂载新的
    // patching & not same type, unmount old tree
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }

    if (n2.patchFlag === PatchFlags.BAIL) {
      optimized = false;
      n2.dynamicChildren = null;
    }

    const { type, ref, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, isSVG);
        } else if (__DEV__) {
          patchStaticNode(n1, n2, container, isSVG);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds,
          optimized
        );
        break;
      // component 会走到 default
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          // component 处理
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & ShapeFlags.TELEPORT) {
          (type as typeof TeleportImpl).process(
            n1 as TeleportVNode,
            n2 as TeleportVNode,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
          (type as typeof SuspenseImpl).process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (__DEV__) {
          warn('Invalid VNode type:', type, `(${typeof type})`);
        }
    }

    // set ref
    if (ref != null && parentComponent) {
      setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    }
  };
  ```

- processComponent 最后调用 mountComponent

  ```ts
  const processComponent = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    slotScopeIds: string[] | null,
    optimized: boolean
  ) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      // 判断是否是 keep-alive
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        (parentComponent!.ctx as KeepAliveContext).activate(
          n2,
          container,
          anchor,
          isSVG,
          optimized
        );
      } else {
        // 首次挂载 component
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  ```

- mountComponent 首次挂载 component

  ```ts
  const mountComponent: MountComponentFn = (
    initialVNode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    // 2.x compat may pre-create the component instance before actually
    // mounting
    const compatMountInstance =
      __COMPAT__ && initialVNode.isCompatRoot && initialVNode.component;
    // 调用 createComponentInstance 生成组件实例
    const instance: ComponentInternalInstance =
      compatMountInstance ||
      (initialVNode.component = createComponentInstance(
        initialVNode,
        parentComponent,
        parentSuspense
      ));

    if (__DEV__ && instance.type.__hmrId) {
      registerHMR(instance);
    }

    if (__DEV__) {
      pushWarningContext(initialVNode);
      startMeasure(instance, `mount`);
    }

    // inject renderer internals for keepAlive
    if (isKeepAlive(initialVNode)) {
      (instance.ctx as KeepAliveContext).renderer = internals;
    }

    // resolve props and slots for setup context
    if (!(__COMPAT__ && compatMountInstance)) {
      if (__DEV__) {
        startMeasure(instance, `init`);
      }
      // 初始化 component
      // setupComponent 中调用了 setupStatefulComponent，setupStatefulComponent中调用了 finishComponentSetup，其中将组件对象的 render 赋值给了组件实例的 render 属性：instance.render = (Component.render || NOOP)
      // 当我们的 component 是有 data 数据的，那么 setupComponent 中的 setupStatefulComponent 中的 finishComponentSetup 中的 applyOptions 会去处理 compontnt 中的 data，获取到 data 函数的返回值，然后将其变成 reactive proxy 然后挂到 instance 上
      setupComponent(instance);
      if (__DEV__) {
        endMeasure(instance, `init`);
      }
    }

    // setup() is async. This component relies on async logic to be resolved
    // before proceeding
    if (__FEATURE_SUSPENSE__ && instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect);

      // Give it a placeholder if this is not hydration
      // TODO handle self-defined fallback
      if (!initialVNode.el) {
        const placeholder = (instance.subTree = createVNode(Comment));
        processCommentNode(null, placeholder, container!, anchor);
      }
      return;
    }

    // 处理组件 effect
    setupRenderEffect(
      instance,
      initialVNode,
      container,
      anchor,
      parentSuspense,
      isSVG,
      optimized
    );

    if (__DEV__) {
      popWarningContext();
      endMeasure(instance, `mount`);
    }
  };
  ```

- setupRenderEffect 处理组件 effect

```ts
const setupRenderEffect: SetupRenderEffectFn = (
  instance,
  initialVNode,
  container,
  anchor,
  parentSuspense,
  isSVG,
  optimized
) => {
  // 为 reactiveEffect 生成 fn 函数
  const componentUpdateFn = () => {
    // 还未 mounted 的阶段
    if (!instance.isMounted) {
      let vnodeHook: VNodeHook | null | undefined;
      const { el, props } = initialVNode;
      const { bm, m, parent } = instance;
      const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);

      toggleRecurse(instance, false);
      // beforeMount hook
      if (bm) {
        invokeArrayFns(bm);
      }
      // onVnodeBeforeMount
      if (
        !isAsyncWrapperVNode &&
        (vnodeHook = props && props.onVnodeBeforeMount)
      ) {
        invokeVNodeHook(vnodeHook, parent, initialVNode);
      }
      if (
        __COMPAT__ &&
        isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
      ) {
        instance.emit('hook:beforeMount');
      }
      toggleRecurse(instance, true);

      if (el && hydrateNode) {
        // vnode has adopted host node - perform hydration instead of mount.
        const hydrateSubTree = () => {
          if (__DEV__) {
            startMeasure(instance, `render`);
          }
          instance.subTree = renderComponentRoot(instance);
          if (__DEV__) {
            endMeasure(instance, `render`);
          }
          if (__DEV__) {
            startMeasure(instance, `hydrate`);
          }
          hydrateNode!(
            el as Node,
            instance.subTree,
            instance,
            parentSuspense,
            null
          );
          if (__DEV__) {
            endMeasure(instance, `hydrate`);
          }
        };

        if (isAsyncWrapperVNode) {
          (initialVNode.type as ComponentOptions).__asyncLoader!().then(
            // note: we are moving the render call into an async callback,
            // which means it won't track dependencies - but it's ok because
            // a server-rendered async wrapper is already in resolved state
            // and it will never need to change.
            () => !instance.isUnmounted && hydrateSubTree()
          );
        } else {
          hydrateSubTree();
        }
      } else {
        if (__DEV__) {
          startMeasure(instance, `render`);
        }
        // 下面会调用 patch 去挂载 subTree，这里就是组件的核心挂载逻辑
        // renderComponentRoot 中调用了组件的 render 函数生成了 vnode 返回，这里 subTree 就是组件的 vnode
        // 当 component 有 data 的时候，render 函数调用的时候是用 call 调用的，传递的 this 其实就是 data 对应的 proxy，所以其中就可以通过 this 获取到响应式数据的值
        const subTree = (instance.subTree = renderComponentRoot(instance));
        if (__DEV__) {
          endMeasure(instance, `render`);
        }
        if (__DEV__) {
          startMeasure(instance, `patch`);
        }
        patch(
          null,
          subTree,
          container,
          anchor,
          instance,
          parentSuspense,
          isSVG
        );
        if (__DEV__) {
          endMeasure(instance, `patch`);
        }
        initialVNode.el = subTree.el;
      }
      // mounted hook
      if (m) {
        queuePostRenderEffect(m, parentSuspense);
      }
      // onVnodeMounted
      if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
        const scopedInitialVNode = initialVNode;
        queuePostRenderEffect(
          () => invokeVNodeHook(vnodeHook!, parent, scopedInitialVNode),
          parentSuspense
        );
      }
      if (
        __COMPAT__ &&
        isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
      ) {
        queuePostRenderEffect(
          () => instance.emit('hook:mounted'),
          parentSuspense
        );
      }

      // activated hook for keep-alive roots.
      // #1742 activated hook must be accessed after first render
      // since the hook may be injected by a child keep-alive
      if (
        initialVNode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE ||
        (parent &&
          isAsyncWrapper(parent.vnode) &&
          parent.vnode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE)
      ) {
        instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        if (
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
        ) {
          queuePostRenderEffect(
            () => instance.emit('hook:activated'),
            parentSuspense
          );
        }
      }
      instance.isMounted = true;

      if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
        devtoolsComponentAdded(instance);
      }

      // #2458: deference mount-only object parameters to prevent memleaks
      initialVNode = container = anchor = null as any;
    } else {
      // updateComponent
      // This is triggered by mutation of component's own state (next: null)
      // OR parent calling processComponent (next: VNode)
      let { next, bu, u, parent, vnode } = instance;
      let originNext = next;
      let vnodeHook: VNodeHook | null | undefined;
      if (__DEV__) {
        pushWarningContext(next || instance.vnode);
      }

      // Disallow component effect recursion during pre-lifecycle hooks.
      toggleRecurse(instance, false);
      if (next) {
        next.el = vnode.el;
        updateComponentPreRender(instance, next, optimized);
      } else {
        next = vnode;
      }

      // beforeUpdate hook
      if (bu) {
        invokeArrayFns(bu);
      }
      // onVnodeBeforeUpdate
      if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
        invokeVNodeHook(vnodeHook, parent, next, vnode);
      }
      if (
        __COMPAT__ &&
        isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
      ) {
        instance.emit('hook:beforeUpdate');
      }
      toggleRecurse(instance, true);

      // render
      if (__DEV__) {
        startMeasure(instance, `render`);
      }
      // 重新调用 render 函数生成新的 vnode
      const nextTree = renderComponentRoot(instance);
      if (__DEV__) {
        endMeasure(instance, `render`);
      }
      // 旧的 vnode
      const prevTree = instance.subTree;
      // 新的 vnode 赋值给 subTree
      instance.subTree = nextTree;

      if (__DEV__) {
        startMeasure(instance, `patch`);
      }
      // patch 更新 dom
      patch(
        prevTree,
        nextTree,
        // parent may have changed if it's in a teleport
        hostParentNode(prevTree.el!)!,
        // anchor may have changed if it's in a fragment
        getNextHostNode(prevTree),
        instance,
        parentSuspense,
        isSVG
      );
      if (__DEV__) {
        endMeasure(instance, `patch`);
      }
      next.el = nextTree.el;
      if (originNext === null) {
        // self-triggered update. In case of HOC, update parent component
        // vnode el. HOC is indicated by parent instance's subTree pointing
        // to child component's vnode
        updateHOCHostEl(instance, nextTree.el);
      }
      // updated hook
      if (u) {
        queuePostRenderEffect(u, parentSuspense);
      }
      // onVnodeUpdated
      if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
        queuePostRenderEffect(
          () => invokeVNodeHook(vnodeHook!, parent, next!, vnode),
          parentSuspense
        );
      }
      if (
        __COMPAT__ &&
        isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
      ) {
        queuePostRenderEffect(
          () => instance.emit('hook:updated'),
          parentSuspense
        );
      }

      if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
        devtoolsComponentUpdated(instance);
      }

      if (__DEV__) {
        popWarningContext();
      }
    }
  };

  // create reactive effect for rendering
  // 生成 reactiveEffect，fn 就是上面的 componentUpdateFn，第二个参数调度器其中的 update 最终就是执行 componentUpdateFn
  const effect = (instance.effect = new ReactiveEffect(
    componentUpdateFn,
    () => queueJob(update),
    instance.scope // track it in component's effect scope
  ));

  // 调度器其中的 update 最终就是执行 componentUpdateFn
  const update: SchedulerJob = (instance.update = () => effect.run());
  update.id = instance.uid;
  // allowRecurse
  // #1801, #2043 component render effects should allow recursive updates
  toggleRecurse(instance, true);

  if (__DEV__) {
    effect.onTrack = instance.rtc
      ? (e) => invokeArrayFns(instance.rtc!, e)
      : void 0;
    effect.onTrigger = instance.rtg
      ? (e) => invokeArrayFns(instance.rtg!, e)
      : void 0;
    update.ownerInstance = instance;
  }

  // 执行 update，其实就是执行 componentUpdateFn
  update();
};
```

## 总结

- 整个组件挂载从 mountComponent 开始，先会创建 component 的实例，调用 setupComponent 初始化组件的属性，并且将 component.render 赋值给 instance.render，setupRenderEffect 中生成 reactiveEffect 实例，fn 是 componentUpdateFn，并调用一次 fn，fn 中调用 render 获取到组件的 vnode，然后调用 patch 生成真正的 dom
- 组件的渲染本质就是 render 函数返回值 vnode 的渲染
- 当我们的 component 是有 data 数据的，那么 setupComponent 会去处理 compontnt 中的 data，获取到 data 函数的返回值，然后将其变成 reactive proxy 然后挂到 instance
  - 所以 setupComponent 做了两件事，第一就是将组件的 render 赋值给 instance.render，第二就是获取到 data 然后将其响应性然后挂到 instance 上
- 有状态组件和无状态组件的区别就在于，有状态的 render 中的 this.data 要变成真实的值，就需要在调用 render 的时候改变 this 的指向，让 this 指向 data 数据对象
- 生命周期函数中访问响应数据的原理是这些 hook 调用了 bind 改变了 this 指向，绑定到了响应式数据上
- setup 的方式定义的组件，其原理不需要处理获取响应数据的 this 指向，因为在 setup 中响应数据和最终返回的 render 函数处于同一作用域下
