# 总结

## 执行上下文

- 当 JavaScript 引擎执行脚本时，它会创建一个全局执行上下文压入调用栈。每遇到一个函数调用，它会为该函数创建一个新的执行上下文并压入栈的顶部。引擎会执行那些执行上下文位于栈顶的函数。当该函数执行结束时，执行上下文从栈中弹出，控制流程到达当前栈中的下一个上下文。
- js 中有词法环境和变量环境，在创建阶段，let 和 const 在词法环境中，是未初始化的，而 var 在变量环境中，会初始化为 undefined，这就是变量提升的原因。

## 作用域

- 作用域就是变量与函数的可访问范围，即作用域控制着变量和函数的可见性和生命周期。有三种作用域：全局作用域 函数作用域 块级作用域（ES6）
- 全局作用域生命周期伴随着页面的生命周期，函数作用域就是在函数内部定义的变量或者函数，变量或者函数只能在函数内部被访问，函数执行结束之后，函数内部定义的变量会被销毁。它的作用域是声明时所在的作用域，而不是运行时的。
- 块级作用域，就是花括号包含的作用域。ES6 浏览器环境中块级作用域中的函数声明，变量提升只会提升函数名 f ，然后赋值 undefined。在词法环境内部，维护了一个小型栈结构，栈底是函数最外层的变量，进入一个块作用域后，就会把该块作用域内部的变量压到栈顶；当作用域执行完成之后，该作用域的信息就会从栈顶弹出，这就是词法环境的结构。执行块作用域中代码需要查找变量时，具体查找方式是：沿着词法环境的栈顶向下查询，如果在词法环境中的某个块中查找到了，就直接返回给 JavaScript 引擎，如果没有查找到，那么继续在变量环境中查找。
- 每个执行上下文的变量环境中，都包含了一个外部引用，用来指向外部的执行上下文，我们把这个外部引用称为 outer。查找变量时，如果在当前的变量环境中没有查找到，那么 JavaScript 引擎会继续在 outer 所指向的执行上下文中查找。这个查找的链条就称为作用域链

## this

- 全局执行上下文中，this 指向 window。默认情况函数执行上下文中 this 也指向 window，如果函数中使用严格模式，函数直接调用时 this 指向 undefined。
- 判断 this 指向：1. new 中调用，this 绑定的是新创建的对象 2. 通过 call、apply（显式绑定），this 绑定的是指定的对象 3. 在某个上下文对象中调用（隐式绑定），this 绑定的是那个上下文对象 4. 如果都不是，使用默认绑定。在严格模式下，绑定到 undefined，否则绑定到全局对象
- 隐式绑定有时会丢失绑定的上下文对象，最后应用默认绑定：函数别名；函数作为参数传递；setTimeout 也是函数作为参数传递；数组的遍历方法，也是将函数作为参数传递；对象的方法中立即执行的函数也会使用默认绑定；浏览器事件的回调函数也会使用默认绑定；赋值表达式，条件表达式，逗号表达式的返回值都会丢失隐式绑定；
- 箭头函数不使用 this 的四种标准规则（也就是不绑定 this），而是根据外层作用域来决定 this

## 闭包

- 一个函数即使创建它的上下文已经销毁，上下文所引用的变量却仍然存在（比如，内部函数从父函数中返回）
- 闭包应用：去抖节流；循环中的定时器，用闭包模拟块级作用域；柯里化；缓存数据；第三方库使用闭包形成私有作用域，防止库中的变量污染全局作用域

## 原型链

- new 调用的时候发生了什么
  1. 以函数的 prototype 为原型创建一个对象。
  2. 将这个对象赋值给函数内部的 this 关键字。
  3. 开始执行构造函数内部的代码。
  4. 如果函数返回值是对象，则返回这个对象，否则返回第一步创建的对象
- 原型链：
  1. 每个构造函数都有一个原型对象 prototype，例如：Object.prototype
  2. 原型对象都包含一个指向构造函数本身的指针 constructor，例如：Object === Object.prototype.constructor
  3. 实例都包含一个指向原型对象的内部指针 **proto**，例如：obj.**proto** === Object.prototype
  4. 当一个构造函数的原型对象 prototype 是另外一个原型对象的实例的时候，内部指针 **proto** 会将这些原型对象串联起来，这就是 原型链。
- 但是所有构造函数都是 Function 类型的对象，拥有 Function 类型的属性和方法，这是因为所有构造函数都有一个内部指针 **proto** 指向了 Function.prototype
- 读取对象的某个属性时，JavaScript 引擎先寻找对象本身的属性，如果找不到，就到它的原型去找，如果还是找不到，就到原型的原型去找。如果直到最顶层的 Object.prototype 还是找不到，则返回 undefined。
- 构造继承 原型继承 组合继承 寄生组合继承

## 事件循环

- 渲染进程。核心任务是将 HTML、CSS 和 JavaScript 转换为网页，排版引擎 Blink 和 JavaScript 引擎 V8 都是运行在该进程中，默认情况下，Chrome 会为每个 Tab 标签创建一个渲染进程。每个渲染进程都有一个主线程，并且主线程非常繁忙，既要处理 DOM，又要计算样式，还要处理布局，同时还需要处理 JavaScript 任务以及各种输入事件。要让这么多不同类型的任务在主线程中有条不紊地执行，这就需要一个系统来统筹调度这些任务，这个统筹调度系统就是消息队列和事件循环系统。
- 1. 所有任务都在主线程上执行。
  2. 主线程之外，还存在一个消息队列。只要其他任务有了运行结果，就放在消息队列中排队等待执行。例如 输入事件（鼠标滚动、点击、移动）、文件读写、WebSocket、JavaScript 定时器等等。
  3. 一旦主线程中的所有任务执行完毕，系统就会读取消息队列，看看里面有哪些在排队的任务。那些任务结束等待状态，进入主线程执行栈，开始执行。
  4. 主线程不断重复上面的第三步。这就是事件循环和消息队列。

- 1. 执行宏任务（task）
     选中一个任务队列为要执行的任务队列，从这个任务队列中取出最早入队的一个 Task，
     因为任务队列不止一个。以下是规范原文。For example, a user agent could have one task queue for mouse and key events (to which the user interaction task source is associated), and another to which all other task sources are associated. Then, using the freedom granted in the initial step of the event loop processing model, it could give keyboard and mouse events preference over other tasks three-quarters of the time, keeping the interface responsive but not starving other task queues. Note that in this setup, the processing model still enforces that the user agent would never process events from any one task source out of order. 大意：浏览器可以有一个任务队列存储鼠标和键盘事件，而剩余的其他任务则放在另外一个任务队列中。浏览器会在保持任务顺序的前提下，可能分配四分之三的优先权给鼠标和键盘事件，保证用户的输入得到最高优先级的响应，而剩下的优先级交给其他 Task，并且保证不会“饿死”它们。
  2. 让这个最早的 Task 执行
  3. 执行微任务（Microtasks）循环微任务队列，执行并清空微任务队列
  4. 更新渲染
  5. 判断是否启动空闲时间算法（window.requestIdleCallback()）
  6. 不断重复以上过程

## 浮点数精度

- 因为 js 内部所有的数字都是以 64 位浮点数形式储存，在做运算的时候，是以这种 64 位浮点形式来运算，也就是二进制数。 十进制的小数转换成二进制时，规则是乘二取整，这样有可能无限循环下去，而除去指数位，/'双精度浮点数的小数位最多能保留 53 位，所以这样必然会损失掉一部分精度。计算完成后再转换成十进制，损失的精度造成了 0.1 + 0.2 不等于 0.3。

```js
function debouce(fn, time) {
  let timer;

  return function () {
    let args = arguments;
    let context = this;

    clearTimeout(timer);

    timer = setTimeout(() => {
      fn.apply(this, args);
    }, time);
  };
}

function throttle(fn, time) {
  let timer;

  return function () {
    let args = arguments;
    let context = this;

    if (!timer) {
      fn.apply(context, args);
      timer = setTimeout(() => {
        timer = null;
      }, time);
    }
  };
}

function _new(constructor) {
  let args = [].slice.call(argument, 1);
  let obj = Object.create(constructor.prototype);
  let res = constructor.apply(obj, args);
  return typeof res === 'object' && res !== null ? res : obj;
}

Object._create = function (proto) {
  function F() {}
  F.prototype = proto;
  return new F();
};

function shuffle(arr) {
  let array = arr.slice();

  for (let i = array.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [array[i], array[r]] = [array[r], array[i]];
  }
  return array;
}

function isClose(str) {
  const arr = str.split('');
  const len = arr.length;

  const stack = [];
  const map = {
    '[': 1,
    ']': -1,
    '(': 2,
    ')': -2,
    '<': 3,
    '>': -3,
  };

  for (let i = 0; i < len; i++) {
    const t = arr[i];
    if (map[t]) {
      if (map[t] + stack[stack.length - 1] === 0) {
        stack.pop();
      } else {
        stack.push(t);
      }
    }
  }

  return stack.length > 0 ? false : true;
}

function compareVersion(v1, v2) {
  const a1 = v1.split('.');
  const a2 = v2.split('.');

  const len = Math.max(a1.length, a2.length);

  while (a1.length < len) {
    a1.push('0');
  }

  while (a2.length < len) {
    a2.push('0');
  }

  for (let i = 0; i < len; i++) {
    const n1 = parseInt(a1[i]);
    const n2 = parseInt(a2[i]);
    if (n1[i] > n2[i]) {
      return 1;
    } else if (n1[i] < n2[i]) {
      return -1;
    }
  }

  return 0;
}

function bubble(arr) {
  let len = arr.length;

  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }

  return arr;
}

function quickSort(arr) {
  let len = arr.length;
  let mid = Math.floor(len / 2);
  let m = arr.splice(mid, 1)[0];
  let left = [];
  let right = [];

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > m) {
      right.push(arr[i]);
    } else {
      left.push(arr[i]);
    }
  }

  return quickSort(left).concat(m, quickSort(right));
}

function find(arr, target) {
  quickSort(arr);

  let min = 0;
  let max = arr.length - 1;

  while (max > min) {
    let mid = Math.floor((min + max) / 2);
    let m = arr[mid];
    if (m > target) {
      max = mid - 1;
    } else if (m < target) {
      min = mid + 1;
    } else {
      return mid;
    }
  }
}
```
