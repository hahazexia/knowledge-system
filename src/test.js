//

//

//

//

//

//

//

//

function mergeSort(arr) {
  let index = Math.floor(arr.length / 2);

  let left = arr.slice(0, index);
  let right = arr.slice(index);

  return merge(mergeSort(left), mergeSort(right));
}

function merge(left, right) {
  let res = [];
  while (left.length && right.length) {
    if (left[0] < right[0]) {
      res.push(left.shift());
    } else {
      res.push(right.shift());
    }
  }

  while (left.length) {
    res.push(left.shift());
  }
  while (right.length) {
    res.push(right.shift());
  }

  return res;
}
