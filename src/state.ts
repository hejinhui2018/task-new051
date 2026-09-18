import { useEffect, useState } from 'react';
import type { ArtPage, FlipMode } from './types';
import { createSamplePages } from './lib/sample';

export interface DeskState {
  pages: ArtPage[];
  flip: FlipMode;
  previewOpen: boolean;
  previewIndex: number;
}

const STORAGE_KEY = 'saddle-stitch-desk:v1';

export function createInitialState(): DeskState {
  return {
    pages: createSamplePages(),
    flip: 'long',
    previewOpen: false,
    previewIndex: 0,
  };
}

function reviveArt(raw: unknown): ArtPage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'art' || typeof o.id !== 'string' || typeof o.title !== 'string') {
    return null;
  }
  return {
    kind: 'art',
    id: o.id,
    title: o.title,
    printed: typeof o.printed === 'number' ? o.printed : undefined,
    bleed: typeof o.bleed === 'number' && o.bleed >= 0 ? o.bleed : 3,
    inverted: Boolean(o.inverted),
    hue: typeof o.hue === 'number' ? o.hue : 200,
  };
}

/** 从 localStorage 恢复；数据损坏或首次访问时回退到内置示例 */
export function loadState(): DeskState {
  const fallback = createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<DeskState>;
    const pages = Array.isArray(data.pages)
      ? (data.pages.map(reviveArt).filter(Boolean) as ArtPage[])
      : null;
    if (!pages) return fallback;
    return {
      pages,
      flip: data.flip === 'short' ? 'short' : 'long',
      previewOpen: Boolean(data.previewOpen),
      previewIndex:
        typeof data.previewIndex === 'number' && data.previewIndex >= 0
          ? Math.floor(data.previewIndex)
          : 0,
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: DeskState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额受限时静默失败，不影响当前会话
  }
}

/** 状态变更后自动持久化的 hook */
export function usePersistedState(): [DeskState, React.Dispatch<React.SetStateAction<DeskState>>] {
  const [state, setState] = useState<DeskState>(loadState);
  useEffect(() => {
    saveState(state);
  }, [state]);
  return [state, setState];
}
