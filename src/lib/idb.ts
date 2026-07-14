/**
 * IndexedDB: audios de las capturas de voz y el handle de la carpeta del vault.
 * Todo lo demás vive en localStorage (es pequeño y se exporta fácil).
 */
const DB_NAME = 'libverde'
const DB_VERSION = 1
const AUDIO = 'audio'
const KV = 'kv'

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO)
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const putAudio = (id: string, blob: Blob) => tx(AUDIO, 'readwrite', (s) => s.put(blob, id))
export const getAudio = (id: string) => tx<Blob | undefined>(AUDIO, 'readonly', (s) => s.get(id))
export const deleteAudio = (id: string) => tx(AUDIO, 'readwrite', (s) => s.delete(id))
export const allAudioIds = () => tx<IDBValidKey[]>(AUDIO, 'readonly', (s) => s.getAllKeys())

export const putKV = <T>(key: string, value: T) => tx(KV, 'readwrite', (s) => s.put(value, key))
export const getKV = <T>(key: string) => tx<T | undefined>(KV, 'readonly', (s) => s.get(key))
export const deleteKV = (key: string) => tx(KV, 'readwrite', (s) => s.delete(key))
