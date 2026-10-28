import type { DrivePickerConfig } from '@frameline/shared'

/**
 * Google's own file picker (Google Picker API), opened in the studio's browser with a drive.file token from
 * GET /v1/drive/picker. Picking a file or folder is what lets Frameline read it. Resolves with the picked ids
 * (empty when the studio closes it).
 */

interface PickerDoc { id: string; name?: string; mimeType?: string }
interface PickerData { action: string; docs?: PickerDoc[] }
interface PickerBuilder {
  addView(v: unknown): PickerBuilder
  enableFeature(f: unknown): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setTitle(t: string): PickerBuilder
  setCallback(cb: (d: PickerData) => void): PickerBuilder
  build(): { setVisible(v: boolean): void }
}
interface GooglePicker {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: unknown) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(m: string): unknown; setParent?(id: string): unknown }
  ViewId: { DOCS: unknown }
  Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown }
  Action: { PICKED: string; CANCEL: string }
}
type GapiWindow = Window & { gapi?: { load(name: string, cb: () => void): void }; google?: { picker?: GooglePicker } }

const SCRIPT = 'https://apis.google.com/js/api.js'
/** What the picker shows: folders and the photo types Frameline imports. */
const MIME = 'application/vnd.google-apps.folder,image/jpeg,image/png,image/webp,image/heic,image/heif'

let loading: Promise<GooglePicker> | null = null
function loadPicker(): Promise<GooglePicker> {
  const w = window as GapiWindow
  if (w.google?.picker) return Promise.resolve(w.google.picker)
  loading ??= new Promise<GooglePicker>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onerror = () => { loading = null; reject(new Error('Google’s file picker didn’t load. Check your connection, or turn off a blocker for apis.google.com.')) }
    s.onload = () => w.gapi!.load('picker', () => (w.google?.picker ? resolve(w.google.picker) : reject(new Error('Google’s file picker didn’t start.'))))
    document.head.appendChild(s)
  })
  return loading
}

export async function pickFromDrive(cfg: DrivePickerConfig): Promise<string[]> {
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(true)
    view.setMimeTypes(MIME)
    let builder = new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setTitle('Pick folders or photos to import')
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setCallback((d) => {
        if (d.action === picker.Action.PICKED) resolve((d.docs ?? []).map((doc) => doc.id))
        else if (d.action === picker.Action.CANCEL) resolve([])
      })
    if (cfg.appId) builder = builder.setAppId(cfg.appId)
    builder.build().setVisible(true)
  })
}
