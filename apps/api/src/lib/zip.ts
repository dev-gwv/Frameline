/**
 * A streaming ZIP writer: stored entries (no compression, since JPEGs don't shrink), each followed by a data
 * descriptor so the CRC is computed while the bytes stream through. Plain ZIP, no ZIP64: at most 65,535 files
 * and 4 GiB in all. Callers stop adding files before either limit (`fits`).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(chunk: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

const MAX_ENTRIES = 0xffff
const MAX_BYTES = 0xffffffff
/** Room kept for the central directory and per-file headers. */
const RESERVE = 16 * 1024 * 1024
/** Bit 3: sizes and CRC follow the data. Bit 11: the name is UTF-8. */
const FLAGS = 0x0808

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear())
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

interface Entry { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number }

export class ZipWriter {
  private offset = 0
  private entries: Entry[] = []
  private names = new Set<string>()
  private enc = new TextEncoder()

  constructor(private write: (chunk: Uint8Array) => Promise<void>) {}

  /** Whether one more file of `size` bytes still fits in a plain ZIP. */
  fits(size: number): boolean {
    return this.entries.length < MAX_ENTRIES && this.offset + size + RESERVE < MAX_BYTES
  }

  /** A name not used yet in this archive: "a.jpg", then "a (2).jpg", … Slashes would make folders, so they go. */
  private uniqueName(raw: string): string {
    const clean = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'photo.jpg'
    let name = clean
    for (let i = 2; this.names.has(name.toLowerCase()); i++) name = clean.replace(/(\.[^.]*)?$/, ` (${i})$1`)
    this.names.add(name.toLowerCase())
    return name
  }

  async add(filename: string, body: ReadableStream<Uint8Array>, modified = new Date()): Promise<void> {
    const name = this.enc.encode(this.uniqueName(filename))
    const { time, date } = dosDateTime(modified)
    const header = new DataView(new ArrayBuffer(30))
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, FLAGS, true)
    header.setUint16(8, 0, true) // stored
    header.setUint16(10, time, true)
    header.setUint16(12, date, true)
    // CRC and sizes (14–25) stay 0: they come in the data descriptor.
    header.setUint16(26, name.length, true)
    header.setUint16(28, 0, true)
    const offset = this.offset
    await this.emit(new Uint8Array(header.buffer))
    await this.emit(name)

    let crc = 0
    let size = 0
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      crc = crc32(value, crc)
      size += value.length
      await this.emit(value)
    }

    const desc = new DataView(new ArrayBuffer(16))
    desc.setUint32(0, 0x08074b50, true)
    desc.setUint32(4, crc, true)
    desc.setUint32(8, size, true)
    desc.setUint32(12, size, true)
    await this.emit(new Uint8Array(desc.buffer))
    this.entries.push({ name, crc, size, offset, time, date })
  }

  /** Writes the central directory. Call once, after the last file. */
  async finish(): Promise<void> {
    const start = this.offset
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46))
      h.setUint32(0, 0x02014b50, true)
      h.setUint16(4, 20, true)
      h.setUint16(6, 20, true)
      h.setUint16(8, FLAGS, true)
      h.setUint16(10, 0, true)
      h.setUint16(12, e.time, true)
      h.setUint16(14, e.date, true)
      h.setUint32(16, e.crc, true)
      h.setUint32(20, e.size, true)
      h.setUint32(24, e.size, true)
      h.setUint16(28, e.name.length, true)
      // extra, comment, disk, internal attributes, external attributes: 0
      h.setUint32(42, e.offset, true)
      await this.emit(new Uint8Array(h.buffer))
      await this.emit(e.name)
    }
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, this.entries.length, true)
    end.setUint16(10, this.entries.length, true)
    end.setUint32(12, this.offset - start, true)
    end.setUint32(16, start, true)
    await this.emit(new Uint8Array(end.buffer))
  }

  get count(): number { return this.entries.length }

  private async emit(chunk: Uint8Array) {
    this.offset += chunk.length
    await this.write(chunk)
  }
}
