import { isArray, isObject, isString } from '.';

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
