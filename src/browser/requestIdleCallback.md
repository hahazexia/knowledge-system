# requestIdleCallback

requestIdleCallback 是 Web API 的一部分，它允许开发者在浏览器空闲时段内执行低优先级的任务，从而避免在高负载时阻塞主线程。

```js
requestIdleCallback(function (deadline) {
  while (
    (deadline.timeRemaining() > 0 || deadline.didTimeout) &&
    tasks.length > 0
  ) {
    var task = tasks.shift(); // 假设 tasks 是一个包含待处理任务的数组
    task(); // 执行任务
  }

  if (tasks.length > 0) {
    requestIdleCallback(doWork); // 如果还有任务，则再次请求空闲回调
  }
});
```

注意，requestIdleCallback 有浏览器兼容问题，谨慎使用
