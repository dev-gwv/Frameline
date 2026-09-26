import Storage from 'expo-sqlite/kv-store'

/**
 * Synchronous key-value storage backed by expo-sqlite's kv-store (the SDK 57 docs position it as the
 * drop-in AsyncStorage replacement, and it offers sync reads which `createMockApi`'s Persistence needs).
 */
export const kv = {
  get(key: string): string | null {
    try { return Storage.getItemSync(key) } catch { return null }
  },
  set(key: string, value: string) {
    try { Storage.setItemSync(key, value) } catch { /* storage unavailable */ }
  },
  remove(key: string) {
    try { Storage.removeItemSync(key) } catch { /* ignore */ }
  },
}
