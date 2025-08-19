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
