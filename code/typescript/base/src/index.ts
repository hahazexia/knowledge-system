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