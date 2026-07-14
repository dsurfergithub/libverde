import { deleteKV, getKV, putKV } from './idb'

/**
 * File System Access API: eliges la carpeta de tu vault de Obsidian UNA vez y
 * LibVerde escribe ahí las memorias. El handle sobrevive a los recargados
 * porque se guarda en IndexedDB.
 *
 * Solo Chrome/Edge de escritorio. En iOS no existe → la UI cae a copiar/descargar.
 */

const HANDLE_KEY = 'vault-handle'

type PermissionMode = 'read' | 'readwrite'

interface FsDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (opts: { mode: PermissionMode }) => Promise<PermissionState>
  requestPermission?: (opts: { mode: PermissionMode }) => Promise<PermissionState>
}

export const vaultSupported = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext

export async function pickVault(): Promise<string | null> {
  if (!vaultSupported()) return null
  // @ts-expect-error showDirectoryPicker aún no está en lib.dom
  const handle: FsDirectoryHandle = await window.showDirectoryPicker({ id: 'libverde-vault', mode: 'readwrite' })
  await putKV(HANDLE_KEY, handle)
  return handle.name
}

export async function forgetVault() {
  await deleteKV(HANDLE_KEY)
}

async function ensurePermission(handle: FsDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  return (await handle.requestPermission?.(opts)) === 'granted'
}

async function getVaultHandle(): Promise<FsDirectoryHandle | null> {
  const handle = await getKV<FsDirectoryHandle>(HANDLE_KEY)
  if (!handle) return null
  if (!(await ensurePermission(handle))) return null
  return handle
}

export async function vaultReady(): Promise<boolean> {
  const h = await getKV<FsDirectoryHandle>(HANDLE_KEY)
  return !!h
}

/** Escribe `carpeta/fichero.md`, creando la carpeta si hace falta. */
export async function writeToVault(folder: string, file: string, content: string): Promise<void> {
  const root = await getVaultHandle()
  if (!root) throw new Error('No hay carpeta de vault conectada, o has denegado el permiso.')
  const dir = await root.getDirectoryHandle(folder, { create: true })
  const fh = await dir.getFileHandle(file, { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
}

// --- Fallbacks universales (móvil incluido) ---

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function downloadFile(name: string, content: string, mime = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
