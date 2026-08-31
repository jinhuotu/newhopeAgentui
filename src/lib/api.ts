export type ApiEnvelope<T> = {
  code: number
  msg: string
  data: T
}

/**
 * 默认空字符串 → 请求同源 `/api/*`。
 * 开发由 Vite proxy 转到 8200；生产由 Nginx 反代到 127.0.0.1:8200。
 * 不要默认写 127.0.0.1：用户用公网 IP 打开页面时会连到自己电脑。
 * 需要直连后端时再设 VITE_API_BASE_URL（如 http://192.168.2.114:8200）。
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

export class ApiError extends Error {
  code: number
  status: number

  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string | null
  signal?: AbortSignal
  /** internal: already retried after token refresh */
  _retry?: boolean
}

function friendlyMessage(status: number, msg?: string): string {
  if (status === 401) {
    return '登录已过期或未登录，请重新登录后再试'
  }
  if (status === 403) {
    return '没有权限执行此操作'
  }
  if (status === 404) {
    return (
      (msg && msg.trim()) ||
      '接口不存在（404）。若刚加过后端路由，请先关掉占用 8200 的旧 API 进程再启动'
    )
  }
  // 优先展示后端具体错误（如 MCP stdio 失败原因）
  if (msg && msg.trim()) {
    return msg.trim()
  }
  if (status === 0 || status >= 500) {
    return '服务暂时不可用，请稍后重试'
  }
  return '请求失败'
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, token, signal, _retry } = options
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    // AbortSignal.timeout / 用户取消：必须原样抛出，否则会被误报成「后端未启动」
    const name = e instanceof Error ? e.name : ''
    if (
      signal?.aborted ||
      name === 'AbortError' ||
      name === 'TimeoutError' ||
      (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    ) {
      throw e
    }
    throw new ApiError('无法连接后端服务，请确认 API 已启动', -1, 0)
  }

  let payload: ApiEnvelope<T> | null = null
  try {
    payload = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(friendlyMessage(res.status, res.statusText), -1, res.status)
  }

  const isAuthEndpoint =
    path.includes('/auth/login') || path.includes('/auth/refresh')
  if (
    res.status === 401 &&
    !_retry &&
    !isAuthEndpoint &&
    Boolean(token)
  ) {
    const { refreshTokens, getAccessToken, clearTokens } = await import('./auth')
    const refreshed = await refreshTokens()
    if (refreshed) {
      return apiRequest<T>(path, {
        ...options,
        token: getAccessToken(),
        _retry: true,
      })
    }
    clearTokens()
    throw new ApiError(friendlyMessage(401, payload.msg), payload.code ?? 40100, 401)
  }

  if (!res.ok || payload.code !== 0) {
    throw new ApiError(
      friendlyMessage(res.status, payload.msg),
      payload.code ?? -1,
      res.status,
    )
  }
  return payload.data
}

/** 带鉴权下载二进制文件并触发浏览器保存 */
export async function apiDownload(
  path: string,
  options: { token?: string | null; fallbackName?: string } = {},
): Promise<void> {
  const { token, fallbackName = 'download.bin' } = options
  const headers: Record<string, string> = { Accept: '*/*' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, { method: 'GET', headers })
  } catch {
    throw new ApiError('无法连接后端服务，请确认 API 已启动', -1, 0)
  }

  if (res.status === 401 && token) {
    const { refreshTokens, getAccessToken, clearTokens } = await import('./auth')
    const refreshed = await refreshTokens()
    if (refreshed) {
      return apiDownload(path, { token: getAccessToken(), fallbackName })
    }
    clearTokens()
    throw new ApiError(friendlyMessage(401), 40100, 401)
  }

  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = (await res.json()) as { msg?: string }
      if (j?.msg) msg = j.msg
    } catch {
      /* ignore */
    }
    throw new ApiError(friendlyMessage(res.status, msg), -1, res.status)
  }

  const blob = await res.blob()
  let filename = fallbackName
  const cd = res.headers.get('Content-Disposition') || ''
  const mStar = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd)
  const m = /filename\s*=\s*"?([^";]+)"?/i.exec(cd)
  if (mStar?.[1]) {
    try {
      filename = decodeURIComponent(mStar[1])
    } catch {
      filename = mStar[1]
    }
  } else if (m?.[1]) {
    filename = m[1]
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 带鉴权拉取二进制，返回 Blob（用于预览） */
export async function apiFetchBlob(
  path: string,
  options: { token?: string | null } = {},
): Promise<Blob> {
  const { token } = options
  const headers: Record<string, string> = { Accept: '*/*' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, { method: 'GET', headers })
  } catch {
    throw new ApiError('无法连接后端服务，请确认 API 已启动', -1, 0)
  }

  if (res.status === 401 && token) {
    const { refreshTokens, getAccessToken, clearTokens } = await import('./auth')
    const refreshed = await refreshTokens()
    if (refreshed) {
      return apiFetchBlob(path, { token: getAccessToken() })
    }
    clearTokens()
    throw new ApiError(friendlyMessage(401), 40100, 401)
  }

  if (!res.ok) {
    throw new ApiError(friendlyMessage(res.status, res.statusText), -1, res.status)
  }
  return res.blob()
}
