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