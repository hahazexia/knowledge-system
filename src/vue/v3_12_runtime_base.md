# runtime 核心原则

## 什么是 runtime？

- runtime 运行时就是将 vnode 渲染到页面中
  - 先调用 h 生成 vnode
  - 再调用 render 将 vnode 渲染到指定位置

## dom 和 虚拟 dom

- html 中任何内容都是一个 dom 节点
- 虚拟 dom 就是使用 js 对象来表示真实 dom 节点

## mount 和 patch 挂载和更新

```html
<script>
  const vnode = {
    type: 'div',
    children: 'hello render',
  };

  const vnode2 = {
    type: 'div',
    children: 'patch render',
  };

  function render(oldVNode, newVNode, container) {
    if (!oldVNode) {
      mount(newVNode, container);
    } else {
      patch(oldVNode, newVNode, container);
    }
  }

  function mount(vnode, container) {
    const ele = document.createElement(vnode.type);
    ele.innerText = vnode.children;
    container.appendChild(ele);
  }

  function unmount(container) {
    container.innerHTML = '';
  }

  function patch(oldVNode, newVNode, container) {
    unmount(container);

    const ele = document.createElement(newVNode.type);
    ele.innerText = newVNode.children;
    container.appendChild(ele);
  }

  render(null, vnode, document.querySelector('#app'));
</script>
```

## h 和 render

- h 用来生成 VNode 的函数
- render 用来创建 VNode 对应的真实 dom

```html
<script>
  const { render, h } = Vue;

  const vnode = h(
    'div',
    {
      class: 'test',
    },
    'hello render'
  );

  const container = document.querySelector('#app');

  render(vnode, container);
</script>
```

## runtime 核心设计原则

- 为什么 runtime 分为 runtime-core 和 runtime-dom 两个模块？
  - 因为 core 中是核心逻辑，而将不同宿主环境中操作 dom 的方法都放在 dom 模块中分离出去了，低耦合更好维护，例如浏览器环境和 ssr 环境操作 dom 是不同的
