export class ActiveFileRegistry {
  #activeKeys = new Map();
  #latestKeys = new Map();

  markActive(id, documentKey) {
    const revision = this.#revision(id, documentKey);
    const latestKey = this.#latestKeys.get(id);
    if (
      revision === null ||
      (latestKey !== undefined && revision < this.#revision(id, latestKey))
    ) {
      return false;
    }
    this.#activeKeys.set(id, documentKey);
    this.#latestKeys.set(id, documentKey);
  }

  markInactive(id, documentKey) {
    if (
      documentKey === undefined ||
      this.#activeKeys.get(id) === documentKey
    ) {
      this.#activeKeys.delete(id);
    }
  }

  isActive(id) {
    return this.#activeKeys.has(id);
  }

  activeKey(id) {
    return this.#activeKeys.get(id);
  }

  #revision(id, documentKey) {
    if (typeof documentKey !== "string") return null;
    const prefix = `${id}-`;
    if (!documentKey.startsWith(prefix)) return null;
    const revision = Number(documentKey.slice(prefix.length));
    return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
  }
}
