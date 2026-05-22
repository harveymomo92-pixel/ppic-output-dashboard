import fs from 'node:fs';
import path from 'node:path';

const defaultRuntimeEnvFile = path.join(/*turbopackIgnore: true*/ process.cwd(), '.runtime', 'ppic-output-dashboard.env');
const legacyRuntimeEnvFile = '/root/.config/ppic-output-dashboard/runtime.env';
export const RUNTIME_ENV_FILE = process.env.PPIC_DASHBOARD_ENV_FILE || defaultRuntimeEnvFile;

function runtimeEnvFiles() {
  const candidates = [process.env.PPIC_DASHBOARD_ENV_FILE, defaultRuntimeEnvFile, legacyRuntimeEnvFile].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

export function loadRuntimeEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const file of runtimeEnvFiles()) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      env[key] = value;
    }
  }
  return env;
}

function parseRuntimeEnvFile() {
  const env: Record<string, string> = {};
  const file = runtimeEnvFiles().find((candidate) => fs.existsSync(candidate));
  if (!file) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

export function writeRuntimeEnv(updates: Record<string, string | undefined | null>) {
  const current = parseRuntimeEnvFile();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === '') delete current[key];
    else current[key] = value;
  }
  const keys = Object.keys(current).filter((key) => /^[A-Z0-9_]+$/.test(key)).sort();
  const body = keys.map((key) => {
    const value = current[key] ?? '';
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  }).join('\n') + '\n';
  fs.mkdirSync(path.dirname(RUNTIME_ENV_FILE), { recursive: true });
  fs.writeFileSync(RUNTIME_ENV_FILE, body, 'utf8');
  return loadRuntimeEnv();
}

export function maskSecret(value: string | undefined | null) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 4) return '••••';
  return `${text.slice(0, 2)}••••${text.slice(-2)}`;
}
