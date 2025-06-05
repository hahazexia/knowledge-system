# IntersectionObserver 实现图片懒加载

IntersectionObserver 是现代浏览器提供的一种强大 API，用于异步监听目标元素与其祖先元素或视口（viewport）交叉状态的变化。这种交叉状态变化通常指目标元素进入或离开视口，或者与其他元素发生重叠。其核心优势在于性能优化，避免了传统滚动事件监听方式带来的大量计算开销。

```js
document.addEventListener('DOMContentLoaded', () => {
  const imgs = document.querySelectorAll('img[data-src]');
  const imgObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imgObserver.unobserve(img);
        }
      });
    },
    {
      rootMargin: '0px',
      threshold: 0.1,
    }
  );

  imgs.forEach((img) => imgObserver.ovserve(img));
});
```
