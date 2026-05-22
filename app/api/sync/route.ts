import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { loadRuntimeEnv } from '@/lib/server/runtime-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const syncScriptPath = path.join(process.cwd(), 'scripts', 'sync-odata.mjs');

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { source?: string; from?: string; to?: string; replace?: boolean };
  const args = [syncScriptPath];
  if (body.source) args.push('--source', body.source);
  if (body.from) args.push('--from', body.from);
  if (body.to) args.push('--to', body.to);
  if (body.replace) args.push('--replace', '1');

  try {
    const runtimeEnv = loadRuntimeEnv();
    const { stdout, stderr } = await (execFileAsync as any)(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...runtimeEnv },
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = stdout.trim();
    const result = output ? JSON.parse(output) : { ok: true };
    return NextResponse.json({ ok: true, result, stderr: stderr.trim(), stdout: output });
  } catch (error) {
    const err = error as Partial<{ message: string; stdout: string; stderr: string; code: number; killed: boolean }>;
    return NextResponse.json({
      ok: false,
      error: err.message || 'Sync failed',
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : '',
      code: typeof err.code === 'number' ? err.code : null,
    }, { status: 500 });
  }
}
