# 基础

## 如何进行类型约束

- 可以约束变量，函数参数，函数返回值

```ts
let name: string;
name = 'haha';

function sum(a: number, b: number): number {
  return a + b;
}
```

- ts 可以在很多场景完成类型推导

```ts
// ts 会自动推导出 sum 的返回值是 number 类型
function sum(a: number, b: number) {
  return a + b;
}
```

- any 表示任意类型，ts 对该类型不做检查

## 源代码和编译结果的差异

编译结果中没有类型约束信息

## 基本类型

- number
- string
- boolean
- 数组
- 对象
- null undefined 是其他所有类型的子类型，可以赋值给其他类型

```ts
let num: number;
let name: string;
let isOdd: boolean;
let nums: number[];
let nums: Array<number>;
let obj: object;

let n: string = null;
let n: string = undefined;
```

`undefined` 可以赋值给其他类型造成的问题可以在配置文件中加上 `strictNullChecks` 来避免

```json
{
  // Visit https://aka.ms/tsconfig to read more about this file
  "compilerOptions": {
    // 编译选项
    "target": "es2024", // 配置编译目标代码的版本
    "module": "commonjs", // 配置编译目标使用的模块化标准
    "lib": ["ES2024"], // 编译过程中需要引入的库文件
    "outDir": "./dist", // 编译结果目录
    "strictNullChecks": true // 更加严格的空值检测
  },
  "include": ["./src"] // 编译哪些目录下的 ts 文件
}
```

## 其他常用类型

- 联合类型 多种类型任选其一。配合类型保护进行判断，类型判断：当对某个变量进行类型判断后，在判断的语句块中便可以确定它的确切类型
- void 类型 通常用于约束函数的返回值，表示函数没有任何返回值
- never 类型 通常用于约束函数的返回值，表示函数永远不可能结束
- 字面量类型 使用一个值进行约束
- 元组类型 Tuple 一个固定长度数组，并且数组中每一项类型确定
- any 类型 可以绕过类型检查，any 类型数据可以赋值给任意类型

```ts
let name: string | undefined = undefined;
function some(): void {}
function throwError(msg: string): never {
  // 永远不会结束的函数
  throw new Error(msg);
}
function alwaysDoSomething(): never {
  // 永远不会结束的函数
  while (true) {}
}
let a: 'A';
let gender: '男' | '女';
let arr: [string, number]; // 元组类型，固定长度数组
let n: any = 1;
let s: string = '';
s = n;
```

## 类型别名

- 类型别名 对已知的类型定义名称

```ts
type 类型名 = 类型;
type Gender = '男' | '女';
type User = {
  name: string;
  age: number;
  gender: Gender;
};
```

## 函数相关约束

- 函数重载：在函数实现之前，对函数调用的多种情况进行声明

```ts
function combine(a: number, b: number): number;
function combine(a: string, b: string): string;
function combine(a: number | string, b: number | string): string | number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a * b;
  } else if (typeof a === 'string' && typeof b === 'string') {
    return a + b;
  }
  throw new Error('a and b must be same type');
}
```

- 可选参数：在某些参数名后加上问号，表示该参数可以不用传递，可选参数必须出现在参数列表的末尾

```ts
function sum(a: number, b: number, c?: number) {
  if (c) {
    return a + b + c;
  } else {
    return a + b;
  }
}
function sum(a: number, b: number, c: number = 0) {
  if (c) {
    return a + b + c;
  } else {
    return a + b;
  }
}
```

## 扑克牌小练习

- 目标，创建一副扑克牌（不包括大小王），打印该扑克牌

```ts
type Deck = NormalCard[];
type Color = '♥' | '♠' | '♦' | '♣';
type NormalCard = {
  color: '♥' | '♠' | '♦' | '♣';
  mark: number;
};

function createDeck(): Deck {
  const deck: Deck = [];
  for (let i = 1; i <= 13; i++) {
    deck.push({
      mark: i,
      color: '♠',
    });
    deck.push({
      mark: i,
      color: '♣',
    });
    deck.push({
      mark: i,
      color: '♥',
    });
    deck.push({
      mark: i,
      color: '♦',
    });
  }
  return deck;
}

function printDeck(deck: Deck) {
  let result = '\n';
  deck.forEach((card, i) => {
    let str = card.color;
    if (card.mark <= 10) {
      str += card.mark;
    } else if (card.mark === 11) {
      str += 'J';
    } else if (card.mark === 12) {
      str += 'Q';
    } else {
      str += 'K';
    }
    result += str + '\t';
    if ((i + 1) % 6 === 0) {
      result += '\n';
    }
  });
  console.log(result);
}

const deck = createDeck();
printDeck(deck);
```

## 扩展类型：枚举

- 枚举通常用于某个变量的取值范围。字面量和联合类型配合也可以达到同样的目标
- 字面量类型的问题：
  - 在类型约束位置，会产生重复代码，使用类型别名可以解决该问题
  - 逻辑含义和真实的值产生混淆，会导致修改真实值的时候，会产生大量修改
  - 字面量类型不会进入编译结果

```ts
// enum 枚举名 {
//   枚举字段 = 值,
// }

enum Gender {
  male = '男',
  female = '女',
}

let gender: Gender;

gender = Gender.male;
```

- 如果要修改枚举的值，甚至修改枚举的字段名，都可以只修改一处，不用修改代码里所有使用到的地方（修改字段名按 F2 就会出现输入框可以修改一处，其他地方自动修改）
- 枚举会出现在编译结果中，编译成对象
- 枚举的字段值可以用字符串或数字
- 数字枚举的值会自动自增，不定义就从 0 开始
- 被数字枚举约束的变量，可以直接赋值为数字 （不建议）
- 数字枚举的编译结果和字符串枚举有差异

- 最佳实践
  - 不要在枚举中既出现字符串值也出现数字值
  - 使用枚举，尽量使用枚举字段的名称，不要使用真实值

下面使用枚举修改之前的扑克牌代码：

```ts
type Deck = NormalCard[];
enum Color {
  heart = '♥',
  spade = '♠',
  club = '♣',
  diamond = '♦',
}
enum Mark {
  A = 'A',
  two = '2',
  three = '3',
  four = '4',
  five = '5',
  six = '6',
  seven = '7',
  eight = '8',
  nine = '9',
  ten = '10',
  jack = 'J',
  queen = 'Q',
  king = 'K',
}
type NormalCard = {
  color: '♥' | '♠' | '♦' | '♣';
  mark: Mark;
};

function createDeck(): Deck {
  const deck: Deck = [];
  const marks = Object.values(Mark);
  const colors = Object.values(Color);

  for (const m of marks) {
    for (const c of colors) {
      deck.push({
        color: c,
        mark: m,
      });
    }
  }
  return deck;
}

function printDeck(deck: Deck) {
  let result = '\n';
  deck.forEach((card, i) => {
    let str = card.color + card.mark;
    result += str + '\t';
    if ((i + 1) % 6 === 0) {
      result += '\n';
    }
  });
  console.log(result);
}

const deck = createDeck();
printDeck(deck);
```

## 扩展知识 位枚举（枚举的位运算）

- 枚举的位运算针对数字枚举

```ts
enum Permission {
  Read = 1, // 0001
  Write = 2, // 0010
  Create = 4, // 0100
  Delete = 8, // 1000
}

// 1 如何组合权限 使用或运算
// 0001
// 或
// 0010
// 0011

// 或运算将两种权限合并起来
let p: Permission = Permission.Read | Permission.Write;

// 2 如何判断是否拥有某个权限
// 0011
// 且
// 0010
// 0010
function hasPermission(target: Permission, per: Permission) {
  return (target & per) === per;
}

hasPermission(p, Permission.Read);

// 3 如何删除某个权限
// 0011
// 异或
// 0010
// 0001
p = p ^ Permission.Write;
```

## 模块化

- ts config 模块化相关配置

| 配置名称         | 含义                             |
| ---------------- | -------------------------------- |
| module           | 设置编译结果中使用的模块化标准   |
| moduleResolution | 设置解析模块的模式               |
| removeComments   | 编译结果移除注释                 |
| noEmitOnError    | 错误时不生成编译结果             |
| esModuleInterop  | 启用 es 模块化交互非 es 模块导出 |

- 前端模块化标准： esm commonjs amd umd system esnext

- 主要关注两个：

  - ts 中如何书写模块化语句
  - 编译结果是什么模块标准

- ts 中导入和导出模块统一使用 esm 模块系统
- 编译结果使用什么模块标准是可以配置的，修改 tsconfig.json 中的 compilerOptions.module 即可
- 如果 module 设置为 esm，编译结果和 ts 代码没有区别
- 如果 module 设置为 commonjs ，导出的声明变成 exports 的属性，默认导出变成 exports.default 属性

```ts
// index.ts
export const name = 'kevin';

export function sum(a: number, b: number): number {
  return a + b;
}

// test.ts
import { name, sum } from './index';

console.log(name);
console.log(sum(1, 2));
```

- 下面是编译成 commonjs 的结果

```js
// index.js
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.name = void 0;
exports.sum = sum;
exports.name = 'kevin';
function sum(a, b) {
  return a + b;
}

// test.js
('use strict');
Object.defineProperty(exports, '__esModule', { value: true });
const index_1 = require('./index');
console.log(index_1.name);
console.log((0, index_1.sum)(1, 2));
```

- 如何在 ts 中书写 commonjs 模块代码

```ts
// 导出
export = name;
// 导入
import name = require('name');

// 这样写会被编译成 commonjs，并且保留类型提示
```

- 模块解析：从什么位置寻找模块，tsconfig 中的 `moduleResolution` 配置项
  - 'node16' 或 'nodenext'：适用于现代版本的 Node.js。Node.js v12 及更高版本同时支持 ECMAScript 导入（import）和 CommonJS 引入（require），二者采用不同的解析算法。这两个 moduleResolution 值在与对应的 module 配置项结合使用时，会根据输出的 JavaScript 代码中 Node.js 实际识别的是 import 还是 require，自动选择对应的解析算法。
  - 'node10'（此前名为 'node'）：适用于 v10 之前的旧版本 Node.js，这类版本仅支持 CommonJS 的 require 语法。在现代代码中，你大概率无需使用 node10 选项。
  - 'bundler'：适用于打包工具（如 Webpack、Vite 等）场景。与 node16 和 nodenext 类似，该模式支持识别 package.json 中的 "imports" 和 - "exports" 字段；但与 Node.js 相关的解析模式不同，bundler 模式从不要求在相对路径导入语句中指定文件扩展名（如 .js、.ts）。
    'classic'：是 TypeScript 1.6 版本发布前使用的解析模式，不应再使用。

## interface 接口

- 接口： 用于描述对象，和类型别名有一些区别，比如约束类方面

```ts
interface User {
  readonly id: number;
  name: string;
  age: number;
  sayHello: () => void;
  doSomething(): void;
}

// 接口的继承
interface A {
  t1: string;
}
interface B {
  t2: string;
}

interface C extends A, B {
  t3: string;
}
```

- readonly 只读修饰符，属性是只读的不能修改

```ts
// 只读数组，这个数组的改变元素的方法都无法使用了
const arr: readonly number[] = [1, 2, 3];
```

## 类型兼容性

- 类型兼容性，如果 B 类型能够赋值给类型 A，则 B 和 A 类型就兼容了
  - 鸭子辩型法 子结构辩型法，目标类型需要某些特征，而赋值的类型只要满足该特征即可，例如只要会嘎嘎叫并且会游泳就是鸭子
  - 但是直接使用对象字面量赋值的时候，会进行更加严格的判断

```ts
interface Duck {
  sound: '嘎嘎嘎';
  swim(): void;
}

let person = {
  name: '伪装成鸭子的人',
  age: 11,
  sound: '嘎嘎嘎' as '嘎嘎嘎',
  swim() {
    console.log(`${this.name}正在游泳并且发出了${this.sound}的声音`);
  },
};

let duck: Duck = person;

// 下面对象字面量直接赋值，ts 会直接报错
let duck: Duck = {
  name: '伪装成鸭子的人',
  age: 11,
  sound: '嘎嘎嘎' as '嘎嘎嘎',
  swim() {
    console.log(`${this.name}正在游泳并且发出了${this.sound}的声音`);
  },
};
```

## 扑克牌小练习 interface

- interface 改写扑克牌练习，加入大小王

```ts
enum Color {
  heart = '♥',
  spade = '♠',
  club = '♣',
  diamond = '♦',
}
enum Mark {
  A = 'A',
  two = '2',
  three = '3',
  four = '4',
  five = '5',
  six = '6',
  seven = '7',
  eight = '8',
  nine = '9',
  ten = '10',
  jack = 'J',
  queen = 'Q',
  king = 'K',
}

interface Card {
  getString(): string;
}

type Deck = Card[];

interface NormalCard extends Card {
  color: Color;
  mark: Mark;
}

interface Joker extends Card {
  type: 'big' | 'small';
}

function createDeck(): Deck {
  const deck: Deck = [];
  const marks = Object.values(Mark);
  const colors = Object.values(Color);

  for (const m of marks) {
    for (const c of colors) {
      deck.push({
        color: c,
        mark: m,
        getString() {
          return `${this.color}_${this.mark}`;
        },
      } as Card);
    }
  }
  let joker: Joker = {
    type: 'small',
    getString() {
      return 'small joker';
    },
  };
  deck.push(joker);
  joker = {
    type: 'big',
    getString() {
      return 'big joker';
    },
  };
  deck.push(joker);
  return deck;
}

function printDeck(deck: Deck) {
  let result = '\n';
  deck.forEach((card, i) => {
    result += card.getString() + '\t';
    if ((i + 1) % 6 === 0) {
      result += '\n';
    }
  });
  console.log(result);
}

const deck = createDeck();
printDeck(deck);
```

## 类

- ts 要求使用属性列表描述类中的属性
- "strictPropertyInitialization": true, // 更严格的属性初始化，必须在 constructor 中初始化属性
- 属性的初始化有两个位置：构造函数中，属性默认值
- 属性可以修饰为可选的
- 属性可以修饰为只读的
- 访问修饰符：控制类中的某个成员的访问权限
  - public 默认的访问修饰符，所有地方都可以访问
  - private 私有的，只能在类中访问
  - protected
- 属性简写：如果某个属性，通过构造函数参数传递，并且不做任何处理直接赋值给该属性，可以简写
- 访问器：用于控制属性的赋值和取值

```ts
class User {
  readonly id: number;
  name: string;
  _age: number;
  gender: '男' | '女' = '男';
  pid?: string;
  private publishNumber: number = 3;
  private currentNumber: number = 0;

  constructor(name: string, age: number) {
    this.id = Math.random();
    this.name = name;
    this._age = age;
  }

  set age(value: number) {
    if (value < 0) {
      this._age = 0;
    } else if (value > 200) {
      this._age = 200;
    } else {
      this._age = Math.floor(value);
    }
  }

  get age() {
    return this._age;
  }

  publish(title: string) {
    if (this.currentNumber < this.publishNumber) {
      console.log(`发布一篇文章: ${title}`);
    } else {
      console.log('发布文章已经到达上限');
    }
  }
}

const u = new User('test', 1);

class Test {
  // 属性简写，构造函数中的参数加上访问修饰符，就意味着定义了一个属性，构造函数接收参数后自动赋值给属性，不做其他修改
  constructor(public name: string) {}
}
```

## 扑克小游戏改成类写法

```ts
enum Color {
  heart = '♥',
  spade = '♠',
  club = '♣',
  diamond = '♦',
}
enum Mark {
  A = 'A',
  two = '2',
  three = '3',
  four = '4',
  five = '5',
  six = '6',
  seven = '7',
  eight = '8',
  nine = '9',
  ten = '10',
  jack = 'J',
  queen = 'Q',
  king = 'K',
}

export class Deck {
  private cards: Card[] = [];

  constructor(cards?: Card[]) {
    if (cards) {
      this.cards = cards;
    } else {
      this._init();
    }
  }

  private _init() {
    const marks = Object.values(Mark);
    const colors = Object.values(Color);

    for (const m of marks) {
      for (const c of colors) {
        this.cards.push({
          color: c,
          mark: m,
          getString() {
            return `${this.color}_${this.mark}`;
          },
        } as NormalCard);
      }
    }
    let joker: Joker = {
      type: 'small',
      getString() {
        return 'small joker';
      },
    };
    this.cards.push(joker);
    joker = {
      type: 'big',
      getString() {
        return 'big joker';
      },
    };
    this.cards.push(joker);
  }

  print() {
    let result = '\n';
    this.cards.forEach((card, i) => {
      result += card.getString() + '\t';
      if ((i + 1) % 6 === 0) {
        result += '\n';
      }
    });
    console.log(result);
  }

  publish(): [Deck, Deck, Deck, Deck] {
    let player1: Deck, player2: Deck, player3: Deck, left: Deck;
    player1 = this.takeCards(17);
    player2 = this.takeCards(17);
    player3 = this.takeCards(17);
    left = new Deck(this.cards);
    return [player1, player2, player3, left];
  }

  private takeCards(n: number): Deck {
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) {
      cards.push(this.cards.shift() as Card);
    }
    return new Deck(cards);
  }

  shuffle() {
    for (let i = 0; i < this.cards.length; i++) {
      const index = this.getRandom(0, this.cards.length);
      [this.cards[i], this.cards[index]] = [this.cards[index], this.cards[i]];
    }
  }

  private getRandom(min: number, max: number) {
    const dec = max - min;
    return Math.floor(Math.random() * dec + min);
  }
}

interface Card {
  getString(): string;
}


interface NormalCard extends Card {
  color: Color;
  mark: Mark;
}

interface Joker extends Card {
  type: 'big' | 'small';
}

const deck = new Deck();
deck.shuffle();
deck.print();
const data = deck.publish();
for (let i = 0; i < data.length; i++) {
  data[i].print();
}
```

## 泛型

- 泛型相当于一个类型变量，在定义时，无法预先知道具体的类型，可以使用该变量来代替，只有调用时才能确定它的类型
- ts 会根据传递的参数推导出泛型的具体类型，如果无法完成推导，并且也没有传递具体的类型，默认为空对象
- 泛型可以设置默认值

```ts
function test<T = number>(arr: T[]){}
```

- 泛型约束

```ts
// 使用 extends 来约束泛型满足某种条件
function test<T extends someType>(data: T){}
```

- 多泛型

```ts
// 将两个数组混合
// [1, 3, 4] + ["a", "b", "c"] = [1, "a", 3, "b", 4, "c"]
function mixinArr<T, K>(arr1: T[], arr2: K[]): (T | K)[] {}
```

- 小练习实现一个字典类

```ts
type Callback<K, V> = (key: K, val: V) => void;

class Dictionary<K, V> {
  private keys: K[] = [];
  private vals: V[] = [];

  set(key: K, val: V) {
    const i = this.keys.indexOf(key);
    if (i < 0) {
      this.keys.push(key);
      this.vals.push(val);
    } else {
      this.vals[i] = val;
    }
  }

  forEach(callback: Callback<K, V>) {
    this.keys.forEach((k, i) => {
      const v = this.vals[i];
      callback(k, v);
    });
  }

  has(k: K): boolean {
    return this.keys.includes(k);
  }

  delete(k: K) {
    const i = this.keys.indexOf(k);
    if (i === -1) {
      return;
    }
    this.keys.splice(i, 1);
    this.vals.splice(i, 1);
  }
}
```