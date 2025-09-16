# js 小技巧

- 剔除对象中不需要的属性生成新的对象，常用于组装请求的参数

  ```js
  const originalObj = {
    name: '张三',
    age: 25,
    gender: '男',
    address: '北京市',
    phone: '123456789',
    email: 'zhangsan@example.com',
  };

  const { age, phone, ...newObj } = originalObj;

  // 剔除不需要的属性
  function excludeProperties(obj, propsToRemove) {
    const propsSet = new Set(propsToRemove);
    return Object.fromEntries(
      Object.entries(obj).filter(([key]) => !propsSet.has(key))
    );
  }

  // 只保留指定的属性
  function pickProperties(obj, propsToKeep) {
    const propsSet = new Set(propsToKeep);
    return Object.fromEntries(
      Object.entries(obj).filter(([key]) => propsSet.has(key))
    );
  }
  ```
