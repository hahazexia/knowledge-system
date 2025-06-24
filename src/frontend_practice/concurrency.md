# 并发控制

```js
/**
 * 通用并发控制函数
 * @param {Array} tasks - 任务数组，每个任务是一个返回Promise的函数
 * @param {number} concurrency - 最大并发数
 * @returns {Promise} - 当所有任务完成时解析的Promise
 */
async function concurrentControl(tasks, concurrency = 4) {
  const results = new Array(tasks.length);
  let index = 0;
  let completed = 0;

  return new Promise((resolve) => {
    // 创建指定数量的工作线程
    const workers = Array(Math.min(concurrency, tasks.length))
      .fill()
      .map(async () => {
        while (index < tasks.length) {
          const currentIndex = index++;
          try {
            // 执行当前任务并存储结果
            results[currentIndex] = await tasks[currentIndex]();
          } catch (error) {
            // 存储错误信息
            results[currentIndex] = error;
          } finally {
            // 任务完成计数
            if (++completed === tasks.length) {
              resolve(results);
            }
          }
        }
      });

    // 等待所有工作线程完成
    Promise.allSettled(workers);
  });
}

/**
 * 通用并发控制函数（带错误重试）
 * @param {Array} tasks - 任务数组，每个任务是一个返回Promise的函数
 * @param {number} concurrency - 最大并发数
 * @param {number} maxRetries - 每个任务的最大重试次数
 * @returns {Promise} - 当所有任务完成时解析的Promise，包含所有结果
 */
async function concurrentControlWithRetry(
  tasks,
  concurrency = 4,
  maxRetries = 3
) {
  const results = new Array(tasks.length);
  let index = 0;
  let completed = 0;

  return new Promise((resolve) => {
    // 创建工作线程
    const workers = Array(Math.min(concurrency, tasks.length))
      .fill()
      .map(async () => {
        while (index < tasks.length) {
          const currentIndex = index++;
          let retries = 0;
          let lastError;

          // 执行带重试的任务
          while (retries <= maxRetries) {
            try {
              results[currentIndex] = await tasks[currentIndex]();
              break; // 成功后跳出重试循环
            } catch (error) {
              lastError = error;
              console.warn(
                `Task ${currentIndex} failed (attempt ${
                  retries + 1
                }/${maxRetries}):`,
                error.message
              );
              retries++;

              if (retries > maxRetries) {
                // 超过最大重试次数，记录错误
                results[currentIndex] = new Error(
                  `Task ${currentIndex} failed after ${maxRetries} retries: ${lastError.message}`
                );
              }
            }
          }

          // 无论成功或失败都算完成一个任务
          if (++completed === tasks.length) {
            resolve(results);
          }
        }
      });

    // 等待所有工作线程完成
    Promise.allSettled(workers);
  });
}
```
