export class KeyedMutex {
  #chains = new Map();

  async run(key, fn) {
    const previous = this.#chains.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    this.#chains.set(key, current);

    try {
      return await current;
    } finally {
      if (this.#chains.get(key) === current) {
        this.#chains.delete(key);
      }
    }
  }
}
