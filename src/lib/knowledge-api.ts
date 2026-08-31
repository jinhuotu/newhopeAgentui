import { apiRequest } from './api';
import { getAccessToken } from './auth';

export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  docCount: number;
  chunkCount: number;
  charCount?: number;
  createdAt: number;
  updatedAt: number;
  canView?: boolean;
  canUse?: boolean;
  canManage?: boolean;
};

export type ReviewStatus = 'pending_review' | 'published' | 'rejected' | string;

export type KbDocItem = {
  id: string;
  baseId?: string | null;
  name: string;
  source: 'file' | 'url' | 'text' | string;
  kind?: 'doc' | '3d' | string;
  fileType?: string;
  size?: number;
  url?: string;
  fileKey?: string;
  previewUrl?: string;
  summary?: string;
  charCount: number;
  chunks?: number;
  tags?: string[];
  uploader?: string;
  status: 'ready' | 'failed' | 'parsing' | string;
  errorMsg?: string | null;
  reviewStatus?: ReviewStatus;
  publishedAt?: number | null;
  reviewComment?: string | null;
  createdAt: number;
};

export type SearchChunk = {
  content: string;
  score: number;
  doc_id?: string;
  kb_id?: string;
  name?: string;
  chunk_index?: number;
  tags?: string[];
};

function requireToken(): string {
  const token = getAccessToken();
  if (!token) {
    throw new Error('请先登录后再操作知识库');
  }
  return token;
}

export type KbAccess = 'view' | 'use' | 'manage';

export type KbAclGrant = {
  id?: number;
  subjectType: 'user' | 'role';
  subjectId: number;
  subjectLabel?: string;
  canView: boolean;
  canUse: boolean;
  canManage: boolean;
};

export type KbAclDirectoryUser = {
  id: number;
  username: string;
  displayName?: string | null;
  department?: string | null;
};

export type KbAclDirectoryRole = {
  id: number;
  code: string;
  name: string;
};

export type KbAclPayload = {
  baseId: string;
  createdBy: number | null;
  grants: KbAclGrant[];
  directory: { users: KbAclDirectoryUser[]; roles: KbAclDirectoryRole[] };
  note?: string;
};

export async function listKnowledgeBaseCatalog(opts?: {
  access?: KbAccess;
}): Promise<{ items: KnowledgeBaseItem[]; canCreate: boolean }> {
  const q = opts?.access ? `?access=${encodeURIComponent(opts.access)}` : '';
  const data = await apiRequest<{ items: KnowledgeBaseItem[]; canCreate?: boolean }>(
    `/api/v1/knowledge/bases${q}`,
    { token: requireToken() },
  );
  return { items: data.items || [], canCreate: Boolean(data.canCreate) };
}

export async function listKnowledgeBases(opts?: { access?: KbAccess }): Promise<KnowledgeBaseItem[]> {
  const { items } = await listKnowledgeBaseCatalog(opts);
  return items;
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
}): Promise<KnowledgeBaseItem> {
  const data = await apiRequest<{ item: KnowledgeBaseItem }>('/api/v1/knowledge/bases', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
  return data.item;
}

export async function getKnowledgeBase(baseId: string): Promise<KnowledgeBaseItem> {
  const data = await apiRequest<{ item: KnowledgeBaseItem }>(
    `/api/v1/knowledge/bases/${encodeURIComponent(baseId)}`,
    { token: requireToken() }
  );
  return data.item;
}

export async function updateKnowledgeBase(
  baseId: string,
  input: { name?: string; description?: string }
): Promise<KnowledgeBaseItem> {
  const data = await apiRequest<{ item: KnowledgeBaseItem }>(
    `/api/v1/knowledge/bases/${encodeURIComponent(baseId)}`,
    { method: 'PATCH', token: requireToken(), body: input }
  );
  return data.item;
}

export async function deleteKnowledgeBase(baseId: string): Promise<void> {
  await apiRequest(`/api/v1/knowledge/bases/${encodeURIComponent(baseId)}`, {
    method: 'DELETE',
    token: requireToken(),
  });
}

export async function listKnowledgeDocuments(
  baseId: string,
  opts?: {
    q?: string;
    reviewStatus?: ReviewStatus;
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: KbDocItem[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams({ baseId });
  const q = opts?.q?.trim();
  if (q) params.set('q', q);
  const rs = opts?.reviewStatus?.trim();
  if (rs) params.set('reviewStatus', rs);
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  const data = await apiRequest<{
    items: KbDocItem[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>(`/api/v1/knowledge/documents?${params.toString()}`, { token: requireToken() });
  return {
    items: data.items || [],
    total: data.total ?? (data.items?.length || 0),
    page: data.page ?? page,
    pageSize: data.pageSize ?? pageSize,
  };
}

export async function checkKnowledgeDocumentDuplicate(input: {
  baseId: string;
  name: string;
  url?: string;
}): Promise<{ duplicates: KbDocItem[]; exists: boolean }> {
  const params = new URLSearchParams({
    baseId: input.baseId,
    name: input.name,
  });
  if (input.url?.trim()) params.set('url', input.url.trim());
  return apiRequest(`/api/v1/knowledge/documents/check-duplicate?${params.toString()}`, {
    token: requireToken(),
  });
}

export async function cancelIngestTask(
  baseId: string,
  taskId: string,
): Promise<IngestTaskItem> {
  const data = await apiRequest<{ item: IngestTaskItem }>(
    `/api/v1/knowledge/ingest-tasks/${encodeURIComponent(taskId)}?baseId=${encodeURIComponent(baseId)}`,
    { method: 'DELETE', token: requireToken() },
  );
  return data.item;
}

export type IngestTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | string;

export type IngestTaskItem = {
  id: string;
  baseId: string;
  taskType: string;
  filename: string;
  status: IngestTaskStatus;
  stage?: string | null;
  forceReplace?: boolean;
  docId?: string | null;
  errorMsg?: string | null;
  uploader?: string | null;
  charCount?: number | null;
  chunkCount?: number | null;
  createdAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
};

export async function listIngestTasks(
  baseId: string,
  opts?: { limit?: number },
): Promise<{ items: IngestTaskItem[]; total: number }> {
  const params = new URLSearchParams({ baseId });
  if (opts?.limit) params.set('limit', String(opts.limit));
  const data = await apiRequest<{ items: IngestTaskItem[]; total?: number }>(
    `/api/v1/knowledge/ingest-tasks?${params.toString()}`,
    { token: requireToken() },
  );
  return { items: data.items || [], total: data.total ?? (data.items?.length || 0) };
}

export async function submitIngestBinaryTask(input: {
  baseId: string;
  file: File;
  uploader?: string;
  force?: boolean;
}): Promise<IngestTaskItem> {
  const form = new FormData();
  form.append('baseId', input.baseId);
  form.append('file', input.file, input.file.name);
  if (input.uploader) form.append('uploader', input.uploader);
  if (input.force) form.append('force', 'true');
  const data = await apiRequest<{ item: IngestTaskItem }>(
    '/api/v1/knowledge/ingest-tasks/upload-file',
    { method: 'POST', token: requireToken(), body: form },
  );
  return data.item;
}

export async function submitIngestTextTask(input: {
  baseId: string;
  name: string;
  content: string;
  fileType?: string;
  size?: number;
  uploader?: string;
  tags?: string[];
  force?: boolean;
  kind?: string;
}): Promise<IngestTaskItem> {
  const data = await apiRequest<{ item: IngestTaskItem }>(
    '/api/v1/knowledge/ingest-tasks/upload',
    {
      method: 'POST',
      token: requireToken(),
      body: input,
    },
  );
  return data.item;
}

export async function uploadKnowledgeDocument(input: {
  baseId: string;
  name: string;
  content: string;
  fileType?: string;
  size?: number;
  uploader?: string;
  tags?: string[];
  force?: boolean;
}): Promise<{ item: KbDocItem; items: KbDocItem[]; replaced?: KbDocItem[] }> {
  return apiRequest('/api/v1/knowledge/documents/upload', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
}

export async function uploadKnowledgeBinaryFile(input: {
  baseId: string;
  file: File;
  uploader?: string;
  force?: boolean;
}): Promise<{ item: KbDocItem; items: KbDocItem[]; replaced?: KbDocItem[] }> {
  const form = new FormData();
  form.append('baseId', input.baseId);
  form.append('file', input.file, input.file.name);
  if (input.uploader) form.append('uploader', input.uploader);
  if (input.force) form.append('force', 'true');
  return apiRequest('/api/v1/knowledge/documents/upload-file', {
    method: 'POST',
    token: requireToken(),
    body: form,
  });
}

export async function createTextDocument(input: {
  baseId: string;
  title: string;
  content: string;
  uploader?: string;
  tags?: string[];
  force?: boolean;
}): Promise<{ item: KbDocItem; items: KbDocItem[]; replaced?: KbDocItem[] }> {
  return apiRequest('/api/v1/knowledge/documents/from-text', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
}

export async function createUrlDocument(input: {
  baseId: string;
  url: string;
  title?: string;
  uploader?: string;
  tags?: string[];
  force?: boolean;
}): Promise<{ item: KbDocItem; items: KbDocItem[]; replaced?: KbDocItem[] }> {
  return apiRequest('/api/v1/knowledge/documents/from-url', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
}

export async function searchKnowledge(input: {
  query: string;
  baseId?: string;
  topK?: number;
}): Promise<SearchChunk[]> {
  const data = await apiRequest<{ chunks: SearchChunk[] }>('/api/v1/knowledge/search', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
  return data.chunks || [];
}

export async function approveKnowledgeDocument(input: {
  baseId: string;
  docId: string;
  comment?: string;
}): Promise<KbDocItem> {
  const data = await apiRequest<{ item: KbDocItem }>(
    `/api/v1/knowledge/documents/${encodeURIComponent(input.docId)}/approve`,
    {
      method: 'POST',
      token: requireToken(),
      body: { baseId: input.baseId, comment: input.comment },
    },
  );
  return data.item;
}

export async function rejectKnowledgeDocument(input: {
  baseId: string;
  docId: string;
  comment?: string;
}): Promise<KbDocItem> {
  const data = await apiRequest<{ item: KbDocItem }>(
    `/api/v1/knowledge/documents/${encodeURIComponent(input.docId)}/reject`,
    {
      method: 'POST',
      token: requireToken(),
      body: { baseId: input.baseId, comment: input.comment },
    },
  );
  return data.item;
}

export async function getKnowledgeDocumentPreview(
  baseId: string,
  docId: string
): Promise<{
  item: KbDocItem;
  chunks: Array<{ chunkIndex: number; content: string }>;
  content: string;
  truncated: boolean;
}> {
  return apiRequest(
    `/api/v1/knowledge/documents/${encodeURIComponent(docId)}/preview?baseId=${encodeURIComponent(baseId)}`,
    { token: requireToken() }
  );
}

export async function deleteKnowledgeDocument(baseId: string, docId: string): Promise<KbDocItem[]> {
  const data = await apiRequest<{ items: KbDocItem[] }>(
    `/api/v1/knowledge/documents/${encodeURIComponent(docId)}?baseId=${encodeURIComponent(baseId)}`,
    { method: 'DELETE', token: requireToken() },
  );
  return data.items || [];
}

export async function getKnowledgeBaseAcl(baseId: string): Promise<KbAclPayload> {
  return apiRequest<KbAclPayload>(
    `/api/v1/knowledge/bases/${encodeURIComponent(baseId)}/acl`,
    { token: requireToken() },
  );
}

export async function saveKnowledgeBaseAcl(
  baseId: string,
  grants: KbAclGrant[],
): Promise<KbAclPayload> {
  return apiRequest<KbAclPayload>(
    `/api/v1/knowledge/bases/${encodeURIComponent(baseId)}/acl`,
    {
      method: 'PUT',
      token: requireToken(),
      body: {
        grants: grants.map((g) => ({
          subjectType: g.subjectType,
          subjectId: g.subjectId,
          canView: g.canView,
          canUse: g.canUse,
          canManage: g.canManage,
        })),
      },
    },
  );
}
