import { gunzipSync } from 'zlib';
import { readFile } from 'fs/promises';
import path from 'path';
import liveDefaults from '../../config/live_defaults.json';
import { AssetMeta } from '@/engine/returns';
import { DailyHistoryPayload, SharedLiveSnapshot } from '@/engine/types';

async function readJsonFile<T>(filepath: string): Promise<T | null> {
  try {
    const raw = await readFile(filepath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readGzipJsonFile<T>(filepath: string): Promise<T | null> {
  try {
    const raw = await readFile(filepath);
    return JSON.parse(gunzipSync(raw).toString('utf8')) as T;
  } catch {
    return null;
  }
}

export async function loadDailyHistoryFromDisk(): Promise<DailyHistoryPayload | null> {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  return (
    await readJsonFile<DailyHistoryPayload>(path.join(dataDir, 'daily_history.json'))
  ) || (
    await readGzipJsonFile<DailyHistoryPayload>(path.join(dataDir, 'daily_history.json.gz'))
  );
}

export async function loadMetaAssetMap(): Promise<Record<string, AssetMeta>> {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const meta = await readJsonFile<{ asset_meta?: Record<string, AssetMeta> }>(path.join(dataDir, 'meta.json'));
  return meta?.asset_meta || {};
}

export async function loadSharedLiveSnapshot(): Promise<SharedLiveSnapshot | null> {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  return await readJsonFile<SharedLiveSnapshot>(path.join(dataDir, 'live_snapshot.json'));
}

export const SHARED_LIVE_DEFAULTS = liveDefaults;
