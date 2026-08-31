import { apiRequest, getApiBaseUrl } from './api'
import { getAccessToken } from './auth'

function requireToken(): string {
  const token = getAccessToken()
  if (!token) throw new Error('请先登录')
  return token
}

export type AuditSummary = {
  retentionDays: number
  cutoffAt: number
  operationTotal: number
  operationFail: number
  loginTotal: number
  loginFail: number
  ragTotal?: number
  ragMiss?: number
  ragSensitive?: number
}

export type OperationLogItem = {
  id: number
  module: string
  action: string
  method: string
  path: string
  resourceId: string | null
  operatorId: number | null
  operatorUsername: string | null
  success: boolean
  statusCode: number
  ip: string
  userAgent: string
  detail: string | null
  errorMsg: string | null
  durationMs: number
  createdAt: number
}

export type LoginLogItem = {
  id: number
  username: string
  userId: number | null
  success: boolean
  reason: string
  ip: string
  userAgent: string
  createdAt: number
}

export type RagAuditLogItem = {
  id: number
  userId: number | null
  username: string
  sessionId: string | null
  agentId: string | null
  query: string
  answer: string | null
  kbIds: string[]
  outcome: string
  chunkCount: number
  topScore: number | null
  refs: Array<{
    rank: number
    docId?: string
    name?: string
    score?: number
    chunkIndex?: number
    preview?: string
  }>
  ip: string
  durationMs: number
  createdAt: number
}

export type AuditList<T> = {
  items: T[]
  total: number
  retentionDays: number
  cutoffAt: number
}

export async function fetchAuditSummary(): Promise<AuditSummary> {
  return apiRequest<AuditSummary>('/api/v1/audit/summary', {
    token: requireToken(),
  })
}

export async function fetchOperationLogs(params?: {
  module?: string
  success?: boolean
  keyword?: string
  limit?: number
  offset?: number
}): Promise<AuditList<OperationLogItem>> {
  const q = new URLSearchParams()
  if (params?.module) q.set('module', params.module)
  if (params?.success !== undefined) q.set('success', String(params.success))
  if (params?.keyword) q.set('keyword', params.keyword)
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiRequest<AuditList<OperationLogItem>>(
    `/api/v1/audit/operations${qs ? `?${qs}` : ''}`,
    { token: requireToken() },
  )
}

export async function fetchLoginLogs(params?: {
  success?: boolean
  username?: string
  limit?: number
  offset?: number
}): Promise<AuditList<LoginLogItem>> {
  const q = new URLSearchParams()
  if (params?.success !== undefined) q.set('success', String(params.success))
  if (params?.username) q.set('username', params.username)
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiRequest<AuditList<LoginLogItem>>(
    `/api/v1/audit/logins${qs ? `?${qs}` : ''}`,
    { token: requireToken() },
  )
}

export async function fetchRagAuditLogs(params?: {
  outcome?: string
  username?: string
  keyword?: string
  limit?: number
  offset?: number
}): Promise<AuditList<RagAuditLogItem>> {
  const q = new URLSearchParams()
  if (params?.outcome) q.set('outcome', params.outcome)
  if (params?.username) q.set('username', params.username)
  if (params?.keyword) q.set('keyword', params.keyword)
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiRequest<AuditList<RagAuditLogItem>>(
    `/api/v1/audit/rag${qs ? `?${qs}` : ''}`,
    { token: requireToken() },
  )
}

export async function downloadRagAuditCsv(params?: {
  outcome?: string
  username?: string
  keyword?: string
  limit?: number
}): Promise<void> {
  const token = requireToken()
  const q = new URLSearchParams()
  if (params?.outcome) q.set('outcome', params.outcome)
  if (params?.username) q.set('username', params.username)
  if (params?.keyword) q.set('keyword', params.keyword)
  if (params?.limit) q.set('limit', String(params.limit ?? 2000))
  const res = await fetch(`${getApiBaseUrl()}/api/v1/audit/rag/export?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
  })
  if (!res.ok) {
    throw new Error(`导出失败 (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rag_audit_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
