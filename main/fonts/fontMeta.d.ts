export interface 字体字面元数据 {
  family: string
  subfamily: string
  fullName: string
  postScriptName: string
  aliases: string[]
  weight: number
  italic: boolean
  fsType: number
  embeddable: boolean
  supportsCjk: boolean
  supportsLatin: boolean
  faceIndex: number
  format: 'ttf' | 'otf'
  tableCount: number
  version: string
  collection: boolean
  fileName: string
  bytes: number
}

export const MAX_FONT_BYTES: number
export function parseFontFile(input: Uint8Array, options?: { fileName?: string }): 字体字面元数据[]
export function extractFontFace(input: Uint8Array, faceIndex?: number): Buffer
