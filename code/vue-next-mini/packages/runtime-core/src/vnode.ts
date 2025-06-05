import { isArray, isFunction, isObject, isString } from '@vue/shared';
import { normalizeClass } from 'packages/shared/src/normalizeProps';
import { ShapeFlags } from 'packages/shared/src/shapeFlags';

export function isSameVNodeType(n1: VNode, n2: VNode) {
  return n1.type === n2.type && n1.key === n2.key;
}

export interface VNode {
  __v_isVNode: true;
  type: any;
  props: any;
  children: any;
  shapeFlag: number;
  key: string;
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
    key: props?.key || null,
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
