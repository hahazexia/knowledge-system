# 基本概念

## 编程范式

1. `命令式`是**关注过程**的一种编程范式，它描述了完成一个功能的**详细逻辑与步骤**。
2. `声明式`是**关注结果**的一种编程范式，它并不关心一个功能的**详细逻辑与步骤**。

## 命令式vs声明式

1. 性能

```js
div.innerText = 'hell world!'; // 耗时为 1

<div>{{ msg }}</div> // 耗时为 1 + n
```

所以 命令式性能 > 声明式性能

2. 可维护性

```js
// 命令式
const divEle = document.querySelector('#app');
const subDivEle = divEle.querySelector('div');
const subPEle = subDivEle.querySelector('p');
const msg = 'hello world!';
subPEle.innerHTML = msg;

// 声明式
<div id="app">
    <div>
        <p>{{ msg }}</p>
    </div>
</div>
```

命令式的可维护性 < 声明式的可维护性

## 企业应用开发设计原则

企业应用的开发的设计原则考虑两个方面：`项目成本`和`开发体验`。

* 决定项目成本的是`开发周期`，声明式在可维护性上优于命令式，所以声明式的项目成本更低。
* 声明式的开发体验更好，心智负担更低。
* 框架的设计过程就是一个在可维护性和性能之间不断取舍的过程

## vue中的html模板解析做了什么

vue 的模板语法解析成真实的 html 标签，中间做了两件事：

1. 编译时 compiler
2. 运行时 runtime

## 运行时

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <script src="https://cdn.bootcdn.net/ajax/libs/vue/3.5.13/vue.global.js"></script>
</head>

<body>
    <div id="app"></div>
</body>
<script>
    const { render, h } = Vue;
    // 生成 vnode
    const vnode = h('div', {
        class: 'test',
    }, 'hello render');
    const container = document.querySelector('#app');
    // 渲染
    render(vnode, container);
</script>

</html>


<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>

<body>
</body>
<script>
    const vnode = {
        type: 'div',
        props: {
            class: 'test'
        },
        children: 'hello render'
    };

    // 创建一个 render 函数
    function render(vnode) {
        const ele = document.createElement(vnode.type);

        ele.className = vnode.props.class;
        ele.innerText = vnode.children;

        document.body.appendChild(ele);
    }

    render(vnode);
</script>

</html>
```

运行时就是通过 render 函数把 vnode 渲染成真实 dom 的过程

## 编译时

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <script src="https://cdn.bootcdn.net/ajax/libs/vue/3.5.13/vue.global.js"></script>
</head>

<body>
    <div id="app"></div>
</body>
<script>
    const { sompile, createApp } = Vue;

    const html = `
    <div class="test">hello compiler</div>
`;

    const renderFn = compile(html);

    const app = createApp({
        render: renderFn
    });

    app.mount('#app');
</script>

</html>
```

编译时就是把 html 模板编译成 render 函数的过程

## 编译时+运行时

为什么 vue 选择使用编译时+运行时的方式来实现？

* 首先，dom渲染分为两个部分：
    - 首次渲染，挂载
    - 更新渲染，打补丁

* 当发生更新的时候，有两种方式来实现：
    - 删除所有节点，重新生成节点(dom 操作多)
    - 删除指定位置节点，然后在新位置插入新节点（涉及 js 计算，少量 dom 操作）

* dom 操作比 js 计算更加耗费性能

1. 针对于`纯运行时`而言，因为不存在编译器，所以我们只能够提供一个复杂的 js 对象。
2. 针对于`纯编译时`而言，因为缺少运行时，所以它只能把分析差异的操作，放到`编译时`进行，同样因为省略了运行时，所以速度可能会更快。但是这种方式这将损失灵活性，比如 svelte ，它就是一个纯编译时的框架，但是它的实际运行速度可能达不到理论上的速度。
3. 运行时+编译时，比如 vue 或 react 都是通过这种方式来进行构建的，使其可以在保持灵活性的基础上，尽量的进行性能的优化，从而达到一种平衡。

## 副作用

* 副作用是指，对数据进行 setter 或 getter 操作时，产生一系列后果
* 副作用可能是会有多个的
* 举例，比如修改了 ref 响应式变量的值，造成了视图更新，这就是产生了一次副作用

## vue3框架设计概述

vue3 分为三大模块：

1. 响应性 reactivity
2. 运行时 runtime
3. 编译器 compiler

* 三者关系，reactive 处理数据，将数据用 Proxy 代理，当数据触发 getter setter 就会产生对应的副作用。编译器将 html 模板转换成 render 函数。运行时将调用 render 函数生成真实的 dom，以及后续更新 dom 的操作。
