export class ActiveFileRegistry {
  #activeIds = new Set();

  markActive(id) {
    this.#activeIds.add(id);
  }

  markInactive(id) {
    this.#activeIds.delete(id);
  }

  isActive(id) {
    return this.#activeIds.has(id);
  }
}
