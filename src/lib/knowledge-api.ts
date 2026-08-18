import { apiRequest } from './api';
import { getAccessToken } from './auth';

export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  docCount: number;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
};

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

export async function listKnowledgeBases(): Promise<KnowledgeBaseItem[]> {
  const data = await apiRequest<{ items: KnowledgeBaseItem[] }>('/api/v1/knowledge/bases', {
    token: requireToken(),
  });
  return data.items || [];
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

export async function listKnowledgeDocuments(baseId: string): Promise<KbDocItem[]> {
  const data = await apiRequest<{ items: KbDocItem[] }>(
    `/api/v1/knowledge/documents?baseId=${encodeURIComponent(baseId)}`,
    { token: requireToken() }
  );
  return data.items || [];
}

export async function uploadKnowledgeDocument(input: {
  baseId: string;
  name: string;
  content: string;
  fileType?: string;
  size?: number;
  uploader?: string;
  tags?: string[];
}): Promise<{ item: KbDocItem; items: KbDocItem[] }> {
  return apiRequest('/api/v1/knowledge/documents/upload', {
    method: 'POST',
    token: requireToken(),
    body: input,
  });
}

export async function createTextDocument(input: {
  baseId: string;
  title: string;
  content: string;
  uploader?: string;
  tags?: string[];
}): Promise<{ item: KbDocItem; items: KbDocItem[] }> {
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
}): Promise<{ item: KbDocItem; items: KbDocItem[] }> {
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
    { method: 'DELETE', token: requireToken() }
  );
  return data.items || [];
}
