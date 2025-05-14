# 实现 runtime h 函数

```ts
export function h(type: any, propsOrChildren?: any, children?: any): VNode {
  // 获取用户传递的参数数量
  const l = arguments.length;

  // 如果用户只传递了两个参数，那么证明第二个参数可能是 props , 也可能是 children
  if (l === 2) {
    // 如果 第二个参数是对象，但不是数组。则第二个参数只有两种可能性：1. VNode 2.普通的 props
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // 如果是 VNode，则 第二个参数代表了 children
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren]);
      }
      // 如果不是 VNode， 则第二个参数代表了 props
      return createVNode(type, propsOrChildren, []);
    } else {
      // 如果第二个参数是数组，则第二个参数代表了 children
      return createVNode(type, null, propsOrChildren);
    }
  } else {
    // 如果用户传递了三个或以上的参数，那么证明第二个参数一定代表了 props
    if (l > 3) {
      // 如果参数在三个以上，则从第二个参数开始，把后续所有参数都作为 children
      children = Array.prototype.slice.call(arguments, 2);
    } else if (l === 3 && isVNode(children)) {
      // 如果传递的参数只有三个，则 children 是单纯的 children
      children = [children];
    }
    // 触发 createVNode 方法，创建 VNode 实例
    return createVNode(type, propsOrChildren, children);
  }
}
```

```ts
export interface VNode {
  __v_isVNode: true;
  type: any;
  props: any;
  children: any;
  shapeFlag: number;
}

export const Text = Symbol('Text');
export const Comment = Symbol('Comment');
export const Fragment = Symbol('Fragment');

export function isVNode(val: any): val is VNode {
  return val ? val.__v_isVNode === true : false;
}

/**w
 * 生成一个 VNode 对象，并返回
 * @param type vnode.type
 * @param props 标签属性或自定义属性
 * @param children? 子节点
 * @returns vnode 对象
 */
export function createVNode(type, props, children): VNode {
  if (props) {
    let { class: kclass, style } = props;
    if (kclass && !isString(kclass)) {
      props.class = normalizeClass(kclass);
    }
  }
  // 通过 bit 位处理 shapeFlag 类型
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : isObject(type)
    ? ShapeFlags.STATEFUL_COMPONENT
    : 0;

  return createBaseVNode(type, props, children, shapeFlag);
}

/**
 * 构建基础 vnode
 */
function createBaseVNode(type, props, children, shapeFlag) {
  const vnode = {
    __v_isVNode: true,
    type,
    props,
    shapeFlag,
  } as VNode;

  normalizeChildren(vnode, children);

  return vnode;
}

// 处理子节点
export function normalizeChildren(vnode: VNode, children: unknown) {
  let type = 0;

  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN;
  } else if (isObject(children)) {
  } else if (isFunction(children)) {
  } else {
    children = String(children);
    type = ShapeFlags.TEXT_CHILDREN;
  }

  vnode.children = children;
  // 按位或赋值，等同于 vnode.shapeFlag = vnode.shapeFlag | type
  vnode.shapeFlag |= type;
}
```

```ts
/**
 * 规范化 class 类，处理 class 的增强
 */
export function normalizeClass(value: unknown): string {
  let res = '';

  if (isString(value)) {
    // 判断是否为 string，如果是 string 就不需要专门处理
    res = value;
  } else if (isArray(value)) {
    // 额外的数组增强。官方案例：https://cn.vuejs.org/guide/essentials/class-and-style.html#binding-to-arrays
    for (let i = 0; i < value.length; i++) {
      // 循环得到数组中的每个元素，通过 normalizeClass 方法进行迭代处理
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + '';
      }
    }
  } else if (isObject(value)) {
    // 额外的对象增强
    for (const name in value as object) {
      // 把 value 当做 boolean 来看，拼接 name
      if ((value as object)[name]) {
        res += name + '';
      }
    }
  }

  return res;
}
```
