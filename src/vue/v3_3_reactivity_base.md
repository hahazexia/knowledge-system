# 响应式核心原则

## Object.defineProperty

```js
let count = 2;
let product = {
  price: 10,
  count: count,
};

let total = 0;
let effect = () => {
  total = product.price * product.count;
};

effect();
console.log(`总价格：${total}`);

Object.defineProperty(product, "count", {
  set(newValue) {
    count = newValue;
    effect();
  },
  get() {
    return count;
  },
});
```

## Object.defineProperty 的缺陷

- 当为 `对象` 新增一个没有在 data 中声明的属性时，新增的属性`不是响应式的`
- 当为 `数组` 通过下标的形式新增一个元素时，新增的元素`不是响应式的`

- 因为 Object.defineProperty 只能为对象中已存在的属性设置 getter 和 setter ，而无法监听`对象新增属性`，所以新增的属性将失去响应性
- vue2 中解决这个问题可以使用 Vue.set() 或 this.$set()，或者重新为对象赋值，数组可以使用那几个变异方法，也就是会改变原数组的方法，例如 splice push pop 等，这些数组变异方法被 vue2 低层改写了，会为新增元素增加响应式

## Proxy

```js
let count = 2;
let product = {
  price: 10,
  count: count,
};

// 只有代理对象才能触发 getter 和 setter
const proxyProduct = new Proxy(product, {
  set(target, key, newVal, receiver) {
    target[key] = newVal;
    effect();
    return true;
  },
  get(target, key, reveiver) {
    return target[key];
  },
});

let total = 0;
let effect = () => {
  total = proxyProduct.price * proxyProduct.count;
};

effect();
console.log(`总价格：${total}`);
```

1. Proxy

- Proxy 将代理一个对象（被代理对象），得到一个新对象（代理对象），同时拥有被代理对象中所有属性
- 当想要修改对象的指定属性时，我们应该使用`代理对象`进行修改
- `代理对象`的任何一个属性都可以触发 handler 的 getter 和 setter

2. Object.defineProperty

- Object.defineProperty 为指定对象的指定属性设置属性描述符
- 当想要修改对象的指定属性时，可以使用原对象进行修改
- 通过属性描述符，只有`被监听`的指定属性才能触发 getter 和 setter

## Reflect

```js
const p1 = {
  lastName: "张",
  firstName: "三",
  get fullName() {
    return this.lastName + this.firstName;
  },
};

const p2 = {
  lastName: "李",
  firstName: "四",
  get fullName() {
    return this.lastName + this.firstName;
  },
};

console.log(p1.fullName); // 张三
console.log(Reflect.get(p1, "fullName")); // 张三
console.log(Reflect.get(p1, "fullName", p2)); // 李四
```

```js
const p1 = {
  lastName: "张",
  firstName: "三",
  get fullName() {
    console.log(this);
    return this.lastName + this.firstName;
  },
};

const proxy = new Proxy(p1, {
  get(target, key, receiver) {
    console.log("getter 行为触发");
    // return target[key]
    return Reflect.get(target, key, receiver);
  },
});

console.log(proxy.fullName);
```

- 当我们期望监听代理对象的 getter 和 setter 时，`不应该使用 target[key]`, 因为它在某些时刻是不可靠的（比如 fullName）。二应该使用 Reflect，借助它的 getter 和 setter，使用 receiver（Proxy 实例）作为 this，以达到期望的结果（触发三次 getter）。
- 一旦在被代理对象内部，通过 this 触发 getter 和 setter 时，也需要被监听，必须使用 Reflect
