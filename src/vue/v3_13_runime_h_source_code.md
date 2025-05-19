# runtime h 函数源码

```html
<script>
  const { h, render, Text, Comment, Fragment } = Vue;

  // dom 元素，子元素是 text 节点
  const vnode = h(
    'div',
    {
      class: 'test',
    },
    'hello render'
  );

  // dom 元素，子元素是数组
  const vnode2 = h('p', [h('p', 'p1'), h('p', 'p2'), h('p', 'p3')]);

  const component = {
    render() {
      const vnode_c = h('div', 'this is a component');
      return vnode_c;
    },
  };
  // 组件
  const vnode3 = h(component);

  // Text
  const vnodeText = h(Text, 'this is a Text');
  // Comment
  const vnodeComment = h(Comment, 'this is a Comment');
  // Fragment
  const vnodeFragment = h(Fragment, 'this is a Fragment');
</script>
```

## h

- `\packages\runtime-core\src\h.ts`

```ts
export function h(type: any, propsOrChildren?: any, children?: any): VNode {
  const l = arguments.length;
  // 用户传递参数处理
  if (l === 2) {
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // single vnode without props
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren]);
      }
      // props without children
      return createVNode(type, propsOrChildren);
    } else {
      // omit props
      return createVNode(type, null, propsOrChildren);
    }
  } else {
    if (l > 3) {
      children = Array.prototype.slice.call(arguments, 2);
    } else if (l === 3 && isVNode(children)) {
      children = [children];
    }
    // 最终调用 createVNode 创建 vnode
    return createVNode(type, propsOrChildren, children);
  }
}
```

- `\packages\runtime-core\src\vnode.ts`

```ts
function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false
): VNode {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (__DEV__ && !type) {
      warn(`Invalid vnode type when creating vnode: ${type}.`);
    }
    type = Comment;
  }

  if (isVNode(type)) {
    // createVNode receiving an existing vnode. This happens in cases like
    // <component :is="vnode"/>
    // #2078 make sure to merge refs during the clone instead of overwriting it
    const cloned = cloneVNode(type, props, true /* mergeRef: true */);
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & ShapeFlags.COMPONENT) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag |= PatchFlags.BAIL;
    return cloned;
  }

  // class component normalization.
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }

  // 2.x async/functional component compat
  if (__COMPAT__) {
    type = convertLegacyComponent(type, currentRenderingInstance);
  }

  // class & style normalization.
  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    props = guardReactiveProps(props)!;
    let { class: klass, style } = props;
    // 如果 class 是个对象，就去标准化 class
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }

  // encode the vnode type information into a bitmap
  // vnode 类型
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
    ? ShapeFlags.SUSPENSE
    : isTeleport(type)
    ? ShapeFlags.TELEPORT
    : isObject(type)
    ? ShapeFlags.STATEFUL_COMPONENT
    : isFunction(type)
    ? ShapeFlags.FUNCTIONAL_COMPONENT
    : 0;

  if (__DEV__ && shapeFlag & ShapeFlags.STATEFUL_COMPONENT && isProxy(type)) {
    type = toRaw(type);
    warn(
      `Vue received a Component which was made a reactive object. This can ` +
        `lead to unnecessary performance overhead, and should be avoided by ` +
        `marking the component with \`markRaw\` or using \`shallowRef\` ` +
        `instead of \`ref\`.`,
      `\nComponent that was made reactive: `,
      type
    );
  }

  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
```

- 调用 createBaseVNode 创建 vnode 对象

```ts
function createBaseVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag = 0,
  dynamicProps: string[] | null = null,
  shapeFlag = type === Fragment ? 0 : ShapeFlags.ELEMENT,
  isBlockNode = false,
  needFullChildrenNormalization = false
) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
  } as VNode;

  // needFullChildrenNormalization 是 true，调用 normalizeChildren 处理 children
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    // normalize suspense children
    if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
      (type as typeof SuspenseImpl).normalize(vnode);
    }
  } else if (children) {
    // compiled element vnode - if children is passed, only possible types are
    // string or Array.
    vnode.shapeFlag |= isString(children)
      ? ShapeFlags.TEXT_CHILDREN
      : ShapeFlags.ARRAY_CHILDREN;
  }

  // validate key
  if (__DEV__ && vnode.key !== vnode.key) {
    warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
  }

  // track vnode for block tree
  if (
    isBlockTreeEnabled > 0 &&
    // avoid a block node from tracking itself
    !isBlockNode &&
    // has current parent block
    currentBlock &&
    // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    (vnode.patchFlag > 0 || shapeFlag & ShapeFlags.COMPONENT) &&
    // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    vnode.patchFlag !== PatchFlags.HYDRATE_EVENTS
  ) {
    currentBlock.push(vnode);
  }

  if (__COMPAT__) {
    convertLegacyVModelProps(vnode);
    defineLegacyVNodeProperties(vnode);
  }

  return vnode;
}
```

- normalizeChildren 处理 children

```ts
export function normalizeChildren(vnode: VNode, children: unknown) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    // children 是数组
    type = ShapeFlags.ARRAY_CHILDREN; // 1 << 4 16
  } else if (typeof children === 'object') {
    // // children 是对象
    if (shapeFlag & (ShapeFlags.ELEMENT | ShapeFlags.TELEPORT)) {
      // Normalize slot to plain children for plain element and Teleport
      const slot = (children as any).default;
      if (slot) {
        // _c marker is added by withCtx() indicating this is a compiled slot
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = ShapeFlags.SLOTS_CHILDREN;
      const slotFlag = (children as RawSlots)._;
      if (!slotFlag && !(InternalObjectKey in children!)) {
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        (children as RawSlots)._ctx = currentRenderingInstance;
      } else if (slotFlag === SlotFlags.FORWARDED && currentRenderingInstance) {
        // a child component receives forwarded slots from the parent.
        // its slot type is determined by its parent's slot type.
        if (
          (currentRenderingInstance.slots as RawSlots)._ === SlotFlags.STABLE
        ) {
          (children as RawSlots)._ = SlotFlags.STABLE;
        } else {
          (children as RawSlots)._ = SlotFlags.DYNAMIC;
          vnode.patchFlag |= PatchFlags.DYNAMIC_SLOTS;
        }
      }
    }
  } else if (isFunction(children)) {
    // children 是函数
    children = { default: children, _ctx: currentRenderingInstance };
    type = ShapeFlags.SLOTS_CHILDREN;
  } else {
    // children 是字符串
    children = String(children);
    // force teleport children to array so it can be moved around
    if (shapeFlag & ShapeFlags.TELEPORT) {
      type = ShapeFlags.ARRAY_CHILDREN;
      children = [createTextVNode(children as string)];
    } else {
      type = ShapeFlags.TEXT_CHILDREN;
    }
  }
  vnode.children = children as VNodeNormalizedChildren;
  // 按位或赋值，用来组合状态
  // 比如 a = 0001 b = 0010 那么 a | b = 0011 ，相当于将 a 和 b 的状态组合到一起，既包含了 a 的二进制位也包含了 b 的二进制位
  vnode.shapeFlag |= type;
}
```

createVNode 中会调用 normalizeClass 来标准化 class

```ts
export function normalizeClass(value: unknown): string {
  let res = '';
  if (isString(value)) {
    // 如果 class 名是字符串原样返回
    res = value;
  } else if (isArray(value)) {
    // 如果 class 名是数组，循环标准化处理后再拼接成字符串返回
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + ' ';
      }
    }
  } else if (isObject(value)) {
    // 如果 class 名是对象，循环如果 value 为真就拼接成字符串返回
    for (const name in value) {
      if (value[name]) {
        res += name + ' ';
      }
    }
  }
  return res.trim();
}
```

## 总结

- vnode 的类型由 shapeFlag 来决定，比如 9 是 ELEMENT+TEXT_CHILDREN，17 是 ELEMENT+ARRAY_CHILDREN
- h 生成子节点的时候是由内向外生成的，先生成子节点，再生成父节点
