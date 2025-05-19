# runtime renderer 源码

```html
<script>
  const { h, render } = Vue;

  // dom 元素，子元素是 text 节点
  const vnode = h(
    'div',
    {
      class: 'test',
    },
    'hello render'
  );

  render(vnode, document.querySelector('#app'));
</script>
```

- `\packages\runtime-core\src\renderer.ts` render 会调用 patch 方法

  ```ts
  const render: RootRenderFunction = (vnode, container, isSVG) => {
    // 如果 vnode 为空，如果旧节点存在就执行 unmount 操作删除旧节点
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
      }
    } else {
      // 调用 patch
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        isSVG
      );
    }
    flushPostFlushCbs();
    container._vnode = vnode; // 旧节点存在 container._vnode 属性中
  };
  ```

- patch 方法，只用关心前四个参数

  ```ts
  const patch: PatchFn = (
    n1, // 旧的 vnode，第一次挂载 n1 是 null
    n2, // 新的 vnode
    container, // app div
    anchor = null, // 锚点 调用原生方法 insertBefore 时，插入到哪个 dom 节点的前面的参数
    parentComponent = null,
    parentSuspense = null,
    isSVG = false,
    slotScopeIds = null,
    optimized = __DEV__ && isHmrUpdating ? false : !!n2.dynamicChildren
  ) => {
    // 如果新旧节点是同一个节点，直接跳过
    if (n1 === n2) {
      return;
    }

    // patching & not same type, unmount old
    // 更新的时候，新旧节点类型不同，比如 div 变成了 h1，那么就将旧节点卸载，然后 n1 设置为 null，然后挂载新的节点
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
    // 根据当前新节点的 type 类型，来判断后续操作
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
      default: // ELEMENT 的节点会走到 default 这里
        // 按位与，用来判断 shapeFlag 是否包含 ShapeFlags.ELEMENT
        // 按照我们的例子，这里是 ELEMENT 节点，所以此处为真就会调用 processElement
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

- processElement

  ```ts
  const processElement = (
    n1: VNode | null, // 旧节点
    n2: VNode, // 新节点
    container: RendererElement, // 容器
    anchor: RendererNode | null, // 锚点 调用原生方法 insertBefore 时，插入到哪个 dom 节点的前面的参数
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    slotScopeIds: string[] | null,
    optimized: boolean
  ) => {
    isSVG = isSVG || (n2.type as string) === 'svg';
    // 第一次挂载 n1 是空，所以就会调用 mountElement
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds,
        optimized
      );
    } else {
      // 更新操作
      patchElement(
        n1,
        n2,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds,
        optimized
      );
    }
  };
  ```

- mountElement

  ```ts
  const mountElement = (
    vnode: VNode, // 要挂载的节点
    container: RendererElement, // 容器
    anchor: RendererNode | null, // 锚点 调用原生方法 insertBefore 时，插入到哪个 dom 节点的前面的参数
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    slotScopeIds: string[] | null,
    optimized: boolean
  ) => {
    let el: RendererElement;
    let vnodeHook: VNodeHook | undefined | null;
    const { type, props, shapeFlag, transition, patchFlag, dirs } = vnode;
    if (
      !__DEV__ &&
      vnode.el &&
      hostCloneNode !== undefined &&
      patchFlag === PatchFlags.HOISTED
    ) {
      // If a vnode has non-null el, it means it's being reused.
      // Only static vnodes can be reused, so its mounted DOM nodes should be
      // exactly the same, and we can simply do a clone here.
      // only do this in production since cloned trees cannot be HMR updated.
      el = vnode.el = hostCloneNode(vnode.el);
    } else {
      // 调用 runtime-dom 中与宿主（浏览器）相关的 createElement 方法创建 dom 元素
      // el 变量和 vnode.el 都是 dom 元素
      el = vnode.el = hostCreateElement(
        vnode.type as string,
        isSVG,
        props && props.is,
        props
      );

      // mount children first, since some props may rely on child content
      // being already rendered, e.g. `<select value>`
      // 按位与 判断子节点类型，然后做对应的处理
      // 我们这里例子子节点是文本，所以走 hostSetElementText
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // hostSetElementText 就是调用 runtime-dom 中与宿主（浏览器）相关的 setElementText 设置 dom 元素的 textContent 属性
        hostSetElementText(el, vnode.children as string);
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        mountChildren(
          vnode.children as VNodeArrayChildren,
          el,
          null,
          parentComponent,
          parentSuspense,
          isSVG && type !== 'foreignObject',
          slotScopeIds,
          optimized
        );
      }

      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'created');
      }
      // 处理 props
      if (props) {
        for (const key in props) {
          if (key !== 'value' && !isReservedProp(key)) {
            // 当这里是 class 的时候，最终调用 runtime-dom 中的 patchClass 为元素设置 className
            hostPatchProp(
              el,
              key,
              null,
              props[key],
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            );
          }
        }
        /**
         * Special case for setting value on DOM elements:
         * - it can be order-sensitive (e.g. should be set *after* min/max, #2325, #4024)
         * - it needs to be forced (#1471)
         * #2353 proposes adding another renderer option to configure this, but
         * the properties affects are so finite it is worth special casing it
         * here to reduce the complexity. (Special casing it also should not
         * affect non-DOM renderers)
         */
        if ('value' in props) {
          hostPatchProp(el, 'value', null, props.value);
        }
        if ((vnodeHook = props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parentComponent, vnode);
        }
      }
      // scopeId
      setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    }
    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      Object.defineProperty(el, '__vnode', {
        value: vnode,
        enumerable: false,
      });
      Object.defineProperty(el, '__vueParentComponent', {
        value: parentComponent,
        enumerable: false,
      });
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
    }
    // #1583 For inside suspense + suspense not resolved case, enter hook should call when suspense resolved
    // #1689 For inside suspense + suspense resolved case, just call it
    const needCallTransitionHooks =
      (!parentSuspense || (parentSuspense && !parentSuspense.pendingBranch)) &&
      transition &&
      !transition.persisted;
    if (needCallTransitionHooks) {
      transition!.beforeEnter(el);
    }
    // 调用 nodeOps 中的 hostInsert 挂载 el 到容器中
    hostInsert(el, container, anchor);
    if (
      (vnodeHook = props && props.onVnodeMounted) ||
      needCallTransitionHooks ||
      dirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        needCallTransitionHooks && transition!.enter(el);
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
      }, parentSuspense);
    }
  };
  ```

- 更新操作的时候走 patchElement

  ```ts
  const patchElement = (
    n1: VNode,
    n2: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    slotScopeIds: string[] | null,
    optimized: boolean
  ) => {
    // 新旧 vnode.el 指向同一个 el 元素
    const el = (n2.el = n1.el!);
    let { patchFlag, dynamicChildren, dirs } = n2;
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook: VNodeHook | undefined | null;

    // disable recurse in beforeUpdate hooks
    parentComponent && toggleRecurse(parentComponent, false);
    if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate');
    }
    parentComponent && toggleRecurse(parentComponent, true);

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }

    const areChildrenSVG = isSVG && n2.type !== 'foreignObject';
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren!,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        areChildrenSVG,
        slotScopeIds
      );
      if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
        traverseStaticChildren(n1, n2);
      }
    } else if (!optimized) {
      // full diff
      // 执行 patchChildren 更新子节点
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        areChildrenSVG,
        slotScopeIds,
        false
      );
    }

    if (patchFlag > 0) {
      // the presence of a patchFlag means this element's render code was
      // generated by the compiler and can take the fast path.
      // in this path old node and new node are guaranteed to have the same shape
      // (i.e. at the exact same position in the source template)
      if (patchFlag & PatchFlags.FULL_PROPS) {
        // element props contain dynamic keys, full diff needed
        // 为 props 执行更新
        patchProps(
          el,
          n2,
          oldProps,
          newProps,
          parentComponent,
          parentSuspense,
          isSVG
        );
      } else {
        // class
        // this flag is matched when the element has dynamic class bindings.
        if (patchFlag & PatchFlags.CLASS) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, 'class', null, newProps.class, isSVG);
          }
        }

        // style
        // this flag is matched when the element has dynamic style bindings
        if (patchFlag & PatchFlags.STYLE) {
          hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG);
        }

        // props
        // This flag is matched when the element has dynamic prop/attr bindings
        // other than class and style. The keys of dynamic prop/attrs are saved for
        // faster iteration.
        // Note dynamic keys like :[foo]="bar" will cause this optimization to
        // bail out and go through a full diff because we need to unset the old key
        if (patchFlag & PatchFlags.PROPS) {
          // if the flag is present then dynamicProps must be non-null
          const propsToUpdate = n2.dynamicProps!;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            // #1471 force patch value
            if (next !== prev || key === 'value') {
              hostPatchProp(
                el,
                key,
                prev,
                next,
                isSVG,
                n1.children as VNode[],
                parentComponent,
                parentSuspense,
                unmountChildren
              );
            }
          }
        }
      }

      // text
      // This flag is matched when the element has only dynamic text children.
      if (patchFlag & PatchFlags.TEXT) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children as string);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      // unoptimized, full diff
      patchProps(
        el,
        n2,
        oldProps,
        newProps,
        parentComponent,
        parentSuspense,
        isSVG
      );
    }

    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated');
      }, parentSuspense);
    }
  };

  const patchChildren: PatchChildrenFn = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    slotScopeIds,
    optimized = false
  ) => {
    // c1 为 旧节点的 children， c2 为 新节点的 children
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;

    const { patchFlag, shapeFlag } = n2;
    // fast path
    if (patchFlag > 0) {
      if (patchFlag & PatchFlags.KEYED_FRAGMENT) {
        // this could be either fully-keyed or mixed (some keyed some not)
        // presence of patchFlag means children are guaranteed to be arrays
        patchKeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & PatchFlags.UNKEYED_FRAGMENT) {
        // unkeyed
        patchUnkeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds,
          optimized
        );
        return;
      }
    }

    // children has 3 possibilities: text, array or no children.
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // text children fast path
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 新节点是 text, 旧节点是 array，卸载子节点
        unmountChildren(c1 as VNode[], parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        // 都是文本，直接更新
        hostSetElementText(container, c2 as string);
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // prev children was array
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 新旧都是 array，diff 操作
          // two arrays, cannot assume anything, do full diff
          patchKeyedChildren(
            c1 as VNode[],
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized
          );
        } else {
          // 旧是数组，新不是数组，卸载子节点
          // no new children, just unmount old
          unmountChildren(c1 as VNode[], parentComponent, parentSuspense, true);
        }
      } else {
        // prev children was text OR null
        // new children is array OR null
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          // 新不是 text，旧是 text，删除旧节点的文本
          hostSetElementText(container, '');
        }
        // mount new if array
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 旧节点不是 array， 新节点是 arry，新节点直接挂载
          mountChildren(
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };

  const patchProps = (
    el: RendererElement,
    vnode: VNode,
    oldProps: Data,
    newProps: Data,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean
  ) => {
    if (oldProps !== newProps) {
      // 循环新的 props，设置新 props
      for (const key in newProps) {
        // empty string is not valid prop
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        // defer patching value
        if (next !== prev && key !== 'value') {
          hostPatchProp(
            el,
            key,
            prev,
            next,
            isSVG,
            vnode.children as VNode[],
            parentComponent,
            parentSuspense,
            unmountChildren
          );
        }
      }
      if (oldProps !== EMPTY_OBJ) {
        // 循环旧的 props，删除已经不存在的 props
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            );
          }
        }
      }
      if ('value' in newProps) {
        hostPatchProp(el, 'value', oldProps.value, newProps.value);
      }
    }
  };
  ```

- patchProp 处理各种 props，比如 class，style，事件

```ts
export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  isSVG = false,
  prevChildren,
  parentComponent,
  parentSuspense,
  unmountChildren
) => {
  if (key === 'class') {
    // 处理 class
    patchClass(el, nextValue, isSVG);
  } else if (key === 'style') {
    // 处理 style
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    // 处理事件
    // ignore v-model listeners
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (
    // 处理 property
    key[0] === '.'
      ? ((key = key.slice(1)), true)
      : key[0] === '^'
      ? ((key = key.slice(1)), false)
      : shouldSetAsProp(el, key, nextValue, isSVG)
  ) {
    patchDOMProp(
      el,
      key,
      nextValue,
      prevChildren,
      parentComponent,
      parentSuspense,
      unmountChildren
    );
  } else {
    // 其他 props 以 attribute 形式更新
    // special case for <input v-model type="checkbox"> with
    // :true-value & :false-value
    // store value as dom properties since non-string values will be
    // stringified.
    if (key === 'true-value') {
      (el as any)._trueValue = nextValue;
    } else if (key === 'false-value') {
      (el as any)._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG, parentComponent);
  }
};

// 判断是否 prop 要以 property 的形式更新，也就是点操作符直接属性赋值
function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean
) {
  if (isSVG) {
    // most keys must be set as attribute on svg elements to work
    // ...except innerHTML & textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true;
    }
    // or native onclick with function values
    if (key in el && nativeOnRE.test(key) && isFunction(value)) {
      return true;
    }
    return false;
  }

  // these are enumerated attrs, however their corresponding DOM properties
  // are actually booleans - this leads to setting it with a string "false"
  // value leading it to be coerced to `true`, so we need to always treat
  // them as attributes.
  // Note that `contentEditable` doesn't have this problem: its DOM
  // property is also enumerated string values.
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
    return false;
  }

  // #1787, #2840 form property on form elements is readonly and must be set as
  // attribute.
  if (key === 'form') {
    return false;
  }

  // #1526 <input list> must be set as attribute
  if (key === 'list' && el.tagName === 'INPUT') {
    return false;
  }

  // #2766 <textarea type> must be set as attribute
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false;
  }

  // native onclick with string value, must be set as attribute
  if (nativeOnRE.test(key) && isString(value)) {
    return false;
  }

  return key in el;
}

// compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]
// 挂载 class 属性
export function patchClass(el: Element, value: string | null, isSVG: boolean) {
  // directly setting className should be faster than setAttribute in theory
  // if this is an element during a transition, take the temporary transition
  // classes into account.
  const transitionClasses = (el as ElementWithTransition)._vtc;
  if (transitionClasses) {
    value = (
      value ? [value, ...transitionClasses] : [...transitionClasses]
    ).join(' ');
  }
  if (value == null) {
    // 某些旧浏览器（如 IE）在处理空 class 属性时存在问题，使用 removeAttribute 能确保完全移除
    el.removeAttribute('class');
  } else if (isSVG) {
    // SVG 是 XML 命名空间下的文档，与 HTML 有不同的属性处理规则。部分浏览器（如 Firefox）要求通过 setAttribute 设置 SVG 的 class 属性才能正确应用样式
    el.setAttribute('class', value);
  } else {
    // class 通过 attribute 或者 property 的形式设置都可以，当时使用 property 的形式直接操作 DOM 对象的属性性能更好，速度快，所以 vue 中使用 property className 的形式来设置
    el.className = value;
  }
}

// 处理 style
export function patchStyle(el: Element, prev: Style, next: Style) {
  const style = (el as HTMLElement).style;
  const isCssString = isString(next);

  if (next && !isCssString) {
    // 如果不是字符串，循环设置 style
    for (const key in next) {
      setStyle(style, key, next[key]);
    }
    // 去除上一轮 style 中已经不存在的样式
    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (next[key] == null) {
          setStyle(style, key, '');
        }
      }
    }
  } else {
    const currentDisplay = style.display;
    if (isCssString) {
      if (prev !== next) {
        // 字符串形式，如果新旧样式不一样，直接赋值 cssText
        style.cssText = next as string;
      }
    } else if (prev) {
      // 无新样式，直接移除 style 属性
      el.removeAttribute('style');
    }
    // indicates that the `display` of the element is controlled by `v-show`,
    // so we always keep the current `display` value regardless of the `style`
    // value, thus handing over control to `v-show`.
    if ('_vod' in el) {
      style.display = currentDisplay;
    }
  }
}

const importantRE = /\s*!important$/;

function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = '';
    if (name.startsWith('--')) {
      // -- 开头的兼容样式
      // custom property definition
      style.setProperty(name, val);
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        // !important 的样式
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        );
      } else {
        // 其他情况直接设置
        style[prefixed as any] = val;
      }
    }
  }
}

// 处理事件
export function patchEvent(
  el: Element & { _vei?: Record<string, Invoker | undefined> },
  rawName: string,
  prevValue: EventValue | null,
  nextValue: EventValue | null,
  instance: ComponentInternalInstance | null = null
) {
  // vei = vue event invokers
  // 从缓存中读取已经存在的事件回调
  const invokers = el._vei || (el._vei = {});
  const existingInvoker = invokers[rawName];
  // 更新事件
  if (nextValue && existingInvoker) {
    // patch
    existingInvoker.value = nextValue;
  } else {
    // 第一次挂载事件
    // parseName 去掉事件名中的 on
    const [name, options] = parseName(rawName);
    if (nextValue) {
      // add 新增
      // createInvoker 创建的其实是这样一个方法：() => invoker.value()
      // 然后将这个 invoker 缓存在 _vei 也就是 invokers[rawName] 中，当相同事件名的回调需要修改的时候，就不需要频繁调用 removeEventListener 和 addEventListener，而是直接修改 existingInvoker.value 就可以了
      const invoker = (invokers[rawName] = createInvoker(nextValue, instance));
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      // remove 移除
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = undefined;
    }
  }
}

function createInvoker(
  initialValue: EventValue,
  instance: ComponentInternalInstance | null
) {
  const invoker: Invoker = (e: Event) => {
    // async edge case #6566: inner click event triggers patch, event handler
    // attached to outer element during patch, and triggered again. This
    // happens because browsers fire microtask ticks between event propagation.
    // the solution is simple: we save the timestamp when a handler is attached,
    // and the handler would only fire if the event passed to it was fired
    // AFTER it was attached.
    const timeStamp = e.timeStamp || _getNow();

    if (skipTimestampCheck || timeStamp >= invoker.attached - 1) {
      // callWithAsyncErrorHandling 只是做了 try catch
      // 这里真正最后执行的是 invoker.value
      callWithAsyncErrorHandling(
        patchStopImmediatePropagation(e, invoker.value),
        instance,
        ErrorCodes.NATIVE_EVENT_HANDLER,
        [e]
      );
    }
  };
  // 真正的回调放在 invoker.value 上
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
```

- 文本节点处理

  ```ts
  const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
    if (n1 == null) {
      // 首次挂载，document.createTextNode 创建文本节点，然后 insertBefore 插入
      hostInsert(
        (n2.el = hostCreateText(n2.children as string)),
        container,
        anchor
      );
    } else {
      // 更新 设置文本节点的 nodeValue
      const el = (n2.el = n1.el!);
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children as string);
      }
    }
  };
  ```

- 注释节点处理

  ```ts
  const processCommentNode: ProcessTextOrCommentFn = (
    n1,
    n2,
    container,
    anchor
  ) => {
    if (n1 == null) {
      // document.createComment 创建注释节点，然后 insertBefore 插入
      hostInsert(
        (n2.el = hostCreateComment((n2.children as string) || '')),
        container,
        anchor
      );
    } else {
      // there's no support for dynamic comments
      n2.el = n1.el;
    }
  };
  ```

- fragment 节点处理

  ```ts
  const processFragment = (
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
    const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!;
    const fragmentEndAnchor = (n2.anchor = n1
      ? n1.anchor
      : hostCreateText(''))!;

    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;

    if (
      __DEV__ &&
      // #5523 dev root fragment may inherit directives
      (isHmrUpdating || patchFlag & PatchFlags.DEV_ROOT_FRAGMENT)
    ) {
      // HMR updated / Dev root fragment (w/ comments), force full diff
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }

    // check if this is a slot fragment with :slotted scope ids
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds
        ? slotScopeIds.concat(fragmentSlotScopeIds)
        : fragmentSlotScopeIds;
    }

    if (n1 == null) {
      // 首次挂载
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      // a fragment can only have array children
      // since they are either generated by the compiler, or implicitly created
      // from arrays.
      // 挂载 children，for 循环每一个子节点，将其挂载
      mountChildren(
        n2.children as VNodeArrayChildren,
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds,
        optimized
      );
    } else {
      if (
        patchFlag > 0 &&
        patchFlag & PatchFlags.STABLE_FRAGMENT &&
        dynamicChildren &&
        // #2715 the previous fragment could've been a BAILed one as a result
        // of renderSlot() with no valid children
        n1.dynamicChildren
      ) {
        // a stable fragment (template root or <template v-for>) doesn't need to
        // patch children order, but it may contain dynamicChildren.
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds
        );
        if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
          traverseStaticChildren(n1, n2);
        } else if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null ||
          (parentComponent && n2 === parentComponent.subTree)
        ) {
          traverseStaticChildren(n1, n2, true /* shallow */);
        }
      } else {
        // keyed / unkeyed, or manual fragments.
        // for keyed & unkeyed, since they are compiler generated from v-for,
        // each child is guaranteed to be a block so the fragment will never
        // have dynamicChildren.
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  ```

## 总结

- ELEMENT | TEXT_CHILDREN 节点的挂载操作

  - 先判断节点类型，然后走对应的处理函数，然后判断旧节点是否存在，然后走挂载或者更新函数
  - 1. 创建 dom 元素
  - 2. 创建子节点文本
  - 3. 处理 props
  - 4. 将 dom 元素插入 container
  - 5. 将旧节点存在 container.\_vnode 属性中

- 更新节点操作，如果新节点和旧节点类型不同，则直接将旧节点删除，然后挂载新节点，如果两个节点类型相同才会走更新操作

- 挂载 props 的时候

  - 对于 class，用 el.className 来挂载
  - 对于 value，用 el.value 或者 el\['value'\] 挂载
  - 对于其他属性，用 el.setAttribute 挂载
  - property 是浏览器根据 html 生成的 dom 节点对象的属性。

- attribute 是在 html 代码中在标签上定义的属性。它会被加入到 dom 节点的 attributes 属性中。
  - element.getAttribute(name) 获取属性
  - element.setAttribute(name, value) 设置属性
  - element.removeAttribute(name) 删除属性
  - element.hasAttribute(name) 是否包含有指定的属性

1. attribute 对象包含标签里定义的所有属性，property 只包含 html 标准的属性，不包含自定义属性
2. attribute 里的属性的值是 html 标签上原始的值，除非使用 setAttribute() 方法更改，不会根据用户输入而改变（eg: input 标签）。property 在页面初始化时会映射并创建 Attribute 对象里的标准属性，从而节点对象能以对象的访问方式获取标准属性。在用户输入内容修改了原始值后，property 里对应的属性会随之变化。即，查看原始值使用 attribute，查看最新值使用 property。（input 的 value 值也可以通过 input.defaultValue 查看原始值）
3. property 与 attribute 的某些属性名称是完全一样的，例如 ref, id。某些名称有些轻微差别，例如 attribute 里的 for、class 属性映射出来对应 property 里的 htmlFor、className.某些属性名称一样，但是属性值会有限制或者修改，不会完全一样，相关的属性有 src, href, disabled, multiple 等。
4. 由于 property 不能读取自定义属性，如果标签在开始的时候对标准属性定义了非标准范围内的值，property 会默认选择一个标准值代替，导致与 attribute 里的属性不完全相等。
   ```html
       <input id="input" type="foo"></input>
       // input.type === 'text'
       // input.getAttribute('type') === 'foo'
   ```

- class 通过 attribute 或者 property 的形式设置都可以，当时使用 property 的形式直接操作 DOM 对象的属性性能更好，速度快，所以 vue 中使用 property className 的形式来设置

- 处理事件的时候使用 createInvoker 创建的其实是这样一个方法：() => invoker.value()。然后将这个 invoker 缓存在 \_vei 也就是 invokers\[rawName\] 中，当相同事件名的回调需要修改的时候，就不需要频繁调用 removeEventListener 和 addEventListener，而是直接修改 existingInvoker.value 就可以了
