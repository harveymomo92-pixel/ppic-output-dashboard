import { NextRequest, NextResponse } from 'next/server';
import { loadAppSettings } from '@/lib/server/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AiProvider = 'gemini' | 'openai' | 'groq' | 'mistral';

type CheckRequestBody = {
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

type CheckResult = {
  ok: true;
  provider: AiProvider;
  ready: boolean;
  keyValid: boolean;
  modelValid: boolean | null;
  message: string;
  details: string;
  checkedAt: string;
  endpoint: string;
  source: 'draft' | 'saved';
  model: string;
  baseUrl: string;
};

const providerLabels: Record<AiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  groq: 'Groq',
  mistral: 'Mistral',
};

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeBaseUrl(value: string) {
  return cleanText(value).replace(/\/+$/, '');
}

async function readResponseMessage(response: Response) {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim();
  if (!trimmed) return response.statusText || 'unknown error';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return cleanText(parsed.error ?? parsed.message ?? parsed.detail ?? trimmed);
    } catch {
      return trimmed.slice(0, 240);
    }
  }
  return trimmed.slice(0, 240);
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelList(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as { data?: unknown; models?: unknown };
  const items = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  return items.map((item) => {
    if (!item || typeof item !== 'object') return '';
    const record = item as Record<string, unknown>;
    return cleanText(record.name ?? record.id ?? record.model ?? record.displayName);
  }).filter(Boolean);
}

function modelMatches(modelList: string[], model: string) {
  const normalized = cleanText(model).toLowerCase();
  if (!normalized) return null;
  return modelList.some((value) => {
    const item = cleanText(value).toLowerCase();
    if (!item) return false;
    return item === normalized || item.endsWith(`/${normalized}`) || item.endsWith(`:${normalized}`);
  });
}

async function checkOpenAiCompatible(provider: Exclude<AiProvider, 'gemini'>, apiKey: string, model: string, baseUrl: string) {
  const endpointBase = normalizeBaseUrl(baseUrl) || (
    provider === 'openai'
      ? 'https://api.openai.com/v1'
      : provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.mistral.ai/v1'
  );
  const endpoint = `${endpointBase}/models`;
  const response = await fetchJsonWithTimeout(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const modelList = response.ok ? parseModelList(await response.json().catch(() => ({}))) : [];
  const keyValid = response.ok;
  const modelValid = cleanText(model) ? modelMatches(modelList, model) : null;
  const ready = keyValid && (modelValid !== false);
  const providerLabel = providerLabels[provider];
  const baseMessage = keyValid
    ? `${providerLabel} API key valid`
    : `${providerLabel} API key tidak valid`;
  const message = modelValid === false
    ? `${baseMessage}, tetapi model "${model}" tidak ditemukan`
    : baseMessage;
  const detail = response.ok
    ? modelList.length
      ? `Berhasil ambil ${modelList.length} model dari ${endpointBase}.`
      : `Endpoint ${endpoint} merespons sukses.`
    : `HTTP ${response.status} · ${await readResponseMessage(response)}`;

  return {
    ready,
    keyValid,
    modelValid,
    message,
    details: detail,
    endpoint,
  };
}

async function checkGemini(apiKey: string, model: string) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchJsonWithTimeout(endpoint, { method: 'GET' });
  const payload = response.ok ? await response.json().catch(() => ({})) : {};
  const modelList = parseModelList(payload);
  const keyValid = response.ok;
  const modelValid = cleanText(model) ? modelMatches(modelList, model) : null;
  const ready = keyValid && (modelValid !== false);
  const baseMessage = keyValid ? 'Gemini API key valid' : 'Gemini API key tidak valid';
  const message = modelValid === false
    ? `${baseMessage}, tetapi model "${model}" tidak ditemukan`
    : baseMessage;
  const detail = response.ok
    ? modelList.length
      ? `Berhasil ambil ${modelList.length} model dari Google Generative Language API.`
      : 'Endpoint Gemini merespons sukses.'
    : `HTTP ${response.status} · ${await readResponseMessage(response)}`;

  return {
    ready,
    keyValid,
    modelValid,
    message,
    details: detail,
    endpoint,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as CheckRequestBody;
  const provider = body.provider;
  if (!provider || !['gemini', 'openai', 'groq', 'mistral'].includes(provider)) {
    return NextResponse.json({ ok: false, error: 'Provider AI tidak valid' }, { status: 400 });
  }

  const settings = loadAppSettings();
  const apiKeyKey = provider === 'gemini'
    ? 'GEMINI_API_KEY'
    : provider === 'openai'
      ? 'OPENAI_API_KEY'
      : provider === 'groq'
        ? 'GROQ_API_KEY'
        : 'MISTRAL_API_KEY';
  const modelKey = provider === 'gemini'
    ? 'GEMINI_MODEL'
    : provider === 'openai'
      ? 'WA_PARSER_AI_MODEL'
      : provider === 'groq'
        ? 'GROQ_MODEL'
        : 'MISTRAL_MODEL';
  const hasDraftKey = Object.prototype.hasOwnProperty.call(body, 'apiKey');
  const hasDraftModel = Object.prototype.hasOwnProperty.call(body, 'model');
  const hasDraftBaseUrl = Object.prototype.hasOwnProperty.call(body, 'baseUrl');
  const baseUrl = provider === 'openai'
    ? cleanText(hasDraftBaseUrl ? body.baseUrl : settings.OPENAI_BASE_URL)
    : '';
  const model = cleanText(hasDraftModel ? body.model : settings[modelKey as keyof typeof settings]);
  const apiKey = hasDraftKey ? cleanText(body.apiKey) : cleanText(settings[apiKeyKey as keyof typeof settings]);

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      provider,
      ready: false,
      keyValid: false,
      modelValid: null,
      message: `${providerLabels[provider]} API key belum diisi`,
      details: `Isi ${apiKeyKey} lalu cek lagi.`,
      checkedAt: new Date().toISOString(),
      endpoint: '',
      source: hasDraftKey ? 'draft' : 'saved',
      model,
      baseUrl,
    } satisfies CheckResult);
  }

  try {
    const result = provider === 'gemini'
      ? await checkGemini(apiKey, model)
      : await checkOpenAiCompatible(provider, apiKey, model, baseUrl);
    return NextResponse.json({
      ok: true,
      provider,
      ...result,
      checkedAt: new Date().toISOString(),
      source: hasDraftKey ? 'draft' : 'saved',
      model,
      baseUrl,
    } satisfies CheckResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({
      ok: true,
      provider,
      ready: false,
      keyValid: false,
      modelValid: null,
      message: `${providerLabels[provider]} tidak bisa dicek`,
      details: message,
      checkedAt: new Date().toISOString(),
      endpoint: '',
      source: hasDraftKey ? 'draft' : 'saved',
      model,
      baseUrl,
    } satisfies CheckResult);
  }
}
