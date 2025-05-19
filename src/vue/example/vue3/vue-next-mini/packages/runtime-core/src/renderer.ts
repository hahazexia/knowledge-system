import { ShapeFlags } from 'packages/shared/src/shapeFlags';
import { Comment, Fragment, isSameVNodeType, Text, VNode } from './vnode';
import { EMPTY_OBJ, isString } from '@vue/shared';
import { normalizeVNode } from './componentRenderUtils';

export interface RenderOptions {
  patchProp(el: Element, key: string, prevValue: any, nextValue: any): void;
  setElementText(node: Element, text: string): void;
  insert(el: Element, parant: Element, anchor?): void;
  createElement(type: string);
  remove(el: Element);
  createText(text: string);
  setText(node: Element, text: string);
  createComment(text: string);
}

export function createRenderer(options: RenderOptions) {
  return baseCreateRenderer(options);
}

function baseCreateRenderer(options: RenderOptions): any {
  const {
    insert: hostInsert,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    setElementText: hostSetElementText,
    remove: hostRemove,
    createText: hostCreateText,
    setText: hostSetText,
    createComment: hostCreateComment,
  } = options;

  const processFragment = (oldVNode, newVNode, container, anchor) => {
    if (oldVNode == null) {
      mountChildren(newVNode.children, container, anchor);
    } else {
      patchChildren(oldVNode, newVNode, container, anchor);
    }
  };

  const processComment = (oldVNode, newVNode, container, anchor) => {
    if (oldVNode == null) {
      newVNode.el = hostCreateComment(newVNode.children);
      hostInsert(newVNode.el, container, anchor);
    } else {
      newVNode.el = oldVNode.el;
    }
  };

  const processText = (oldVNode, newVNode, container, anchor) => {
    if (oldVNode == null) {
      newVNode.el = hostCreateText(newVNode.children);
      hostInsert(newVNode.el, container, anchor);
    } else {
      const el = (newVNode.el = oldVNode.el!);
      if (newVNode.children !== oldVNode.children) {
        hostSetText(el, newVNode.children);
      }
    }
  };

  const processElement = (oldVNode, newVNode, container, anchor) => {
    if (oldVNode == null) {
      mountElement(newVNode, container, anchor);
    } else {
      patchElement(oldVNode, newVNode);
    }
  };

  const mountElement = (vnode, container, anchor) => {
    const { type, props, shapeFlag } = vnode;

    const el = (vnode.el = hostCreateElement(type));

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
    }

    if (props) {
      for (const key in props) {
        hostPatchProp(el, key, null, props[key]);
      }
    }

    hostInsert(el, container, anchor);
  };

  const patchElement = (oldVNode, newVNode) => {
    const el = (newVNode.el = oldVNode.el);

    const oldProps = oldVNode.props || EMPTY_OBJ;
    const newProps = newVNode.props || EMPTY_OBJ;

    patchChildren(oldVNode, newVNode, el, null);

    patchProps(el, newVNode, oldProps, newProps);
  };

  const mountChildren = (children, container, anchor) => {
    if (isString(children)) {
      children = children.split('');
    }
    for (let i = 0; i < children.length; i++) {
      const child = (children[i] = normalizeVNode(children[i]));
      patch(null, child, container, anchor);
    }
  };

  const patchChildren = (oldVNode, newVNode, container, anchor) => {
    const c1 = oldVNode && oldVNode.children;
    const prevShapeFlag = oldVNode ? oldVNode.shapeFlag : 0;
    const c2 = newVNode && newVNode.children;
    const { shapeFlag } = newVNode;

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 新节点是 text, 旧节点是 array，卸载子节点
      }
      if (c2 !== c1) {
        // 都是文本，直接更新
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 新旧都是 array，diff 操作
        } else {
          // 旧是数组，新不是数组，卸载子节点
        }
      } else {
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          // 新不是 text，旧是 text，删除旧节点的文本
          hostSetElementText(container, '');
        }
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 旧节点不是 array， 新节点是 arry，新节点直接挂载
        }
      }
    }
  };

  const patchProps = (el: Element, vnode, oldProps, newProps) => {
    if (oldProps !== newProps) {
      for (const key in newProps) {
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev) {
          hostPatchProp(el, key, prev, next);
        }
      }
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!(key in newProps)) {
            hostPatchProp(el, key, oldProps[key], null);
          }
        }
      }
    }
  };

  const patch = (oldVNode, newVNode, container, anchor = null) => {
    if (oldVNode === newVNode) {
      return;
    }

    if (oldVNode && !isSameVNodeType(oldVNode, newVNode)) {
      unmount(oldVNode);
      oldVNode = null;
    }

    const { type, shapeFlag } = newVNode;

    switch (type) {
      case Text:
        processText(oldVNode, newVNode, container, anchor);
        break;
      case Comment:
        processComment(oldVNode, newVNode, container, anchor);
        break;
      case Fragment:
        processFragment(oldVNode, newVNode, container, anchor);
        break;
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(oldVNode, newVNode, container, anchor);
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
        }
    }
  };

  const unmount = vnode => {
    hostRemove(vnode.el);
  };

  const render = (vnode, container) => {
    if (vnode === null) {
      // 卸载
      if (container._vnode) {
        unmount(container._vnode);
      }
    } else {
      patch(container._vnode || null, vnode, container);
    }

    container._vnode = vnode;
  };

  return {
    render,
  };
}
