/**
 * 浏览器端智能读文件：文本直读、DOCX(mammoth)、三维元数据占位。
 * 从知识库详情页抽出，供上传入库复用。
 */

const THREE_D_EXTS = ['fbx', 'obj', 'gltf', 'glb', 'stl']

export type ParsedFile = {
  content: string
  /** 是否抽到可用于 RAG 的正文（非元数据占位） */
  fullText: boolean
}

function fmtSize(n?: number) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export { THREE_D_EXTS, fmtSize }

export async function readFileSmart(file: File): Promise<ParsedFile> {
  const t = file.name.split('.').pop()?.toLowerCase() || ''
  const textLike = ['txt', 'md', 'csv', 'json', 'log', 'xml', 'yaml', 'yml']
  if (textLike.includes(t)) {
    return { content: await file.text(), fullText: true }
  }

  // Word .docx：浏览器端用 mammoth 抽正文，再交给后端分块向量化
  if (t === 'docx') {
    const mammoth = await import('mammoth')
    const buffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    const text = (result.value || '').replace(/\r\n/g, '\n').trim()
    if (text.length < 4) {
      throw new Error('DOCX 未解析出有效正文，请改用「文本粘贴」或检查文件是否损坏')
    }
    return { content: text, fullText: true }
  }

  if (t === 'doc') {
    throw new Error(
      '旧版 .doc 暂不支持浏览器解析，请另存为 .docx 后上传，或使用「文本粘贴」',
    )
  }

  // 三维图纸：仅入库元数据（预览用），不参与正文 RAG
  if (THREE_D_EXTS.includes(t)) {
    return {
      content: [
        `（三维图纸元数据入库，不参与正文检索。）`,
        `文件名：${file.name}`,
        `大小：${fmtSize(file.size)}`,
        `格式：${t.toUpperCase()}`,
      ].join('\n'),
      fullText: false,
    }
  }

  // PDF / Excel / 图片 / CAD 等：避免静默写入假正文，明确提示
  throw new Error(
    `${t.toUpperCase() || '该'} 格式暂无法在浏览器全文解析。请先转为 .docx / .txt / .md，或使用「文本粘贴」录入正文`,
  )
}
