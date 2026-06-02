export class Inventory {
  constructor() { this._items = {}; }

  add(item, qty = 1) {
    this._items[item] = (this._items[item] ?? 0) + qty;
  }

  remove(item, qty = 1) {
    if (!this.has(item, qty)) return false;
    this._items[item] -= qty;
    if (this._items[item] <= 0) delete this._items[item];
    return true;
  }

  has(item, qty = 1) { return (this._items[item] ?? 0) >= qty; }
  count(item) { return this._items[item] ?? 0; }

  toArray() {
    return Object.entries(this._items).map(([item, qty]) => ({ item, qty }));
  }
}
