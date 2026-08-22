/**
 * High-performance asynchronous text processing utilities for 1,000,000+ line documents.
 * Prevents V8 heap freezes, garbage collection spikes, and main thread blocking.
 */

// Non-blocking async line splitter for large document content (> 10MB or 1M+ lines)
export async function splitLinesAsync(
  text: string,
  onProgress?: (processed: number, total: number) => void
): Promise<string[]> {
  if (text.length < 1000000) {
    return text.split("\n");
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      const lines: string[] = [];
      const chunkSize = 2000000; // 2MB string slice per chunk
      let startIdx = 0;
      let lineStart = 0;
      const totalLen = text.length;

      function processChunk() {
        const endIdx = Math.min(startIdx + chunkSize, totalLen);
        const chunk = text.slice(startIdx, endIdx);

        for (let i = 0; i < chunk.length; i++) {
          if (chunk.charCodeAt(i) === 10) { // '\n'
            lines.push(text.slice(lineStart, startIdx + i));
            lineStart = startIdx + i + 1;
          }
        }

        startIdx = endIdx;

        if (onProgress) {
          onProgress(startIdx, totalLen);
        }

        if (startIdx < totalLen) {
          setTimeout(processChunk, 0);
        } else {
          // Push remaining line
          if (lineStart <= totalLen) {
            lines.push(text.slice(lineStart));
          }
          resolve(lines);
        }
      }

      processChunk();
    }, 0);
  });
}

// Bounded Fast LRU Cache for high-frequency string parse indexing
export class LRUMap<K, V> {
  private cache = new Map<K, V>();
  private maxCapacity: number;

  constructor(maxCapacity = 10000) {
    this.maxCapacity = maxCapacity;
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      // Move to back (most recently used)
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxCapacity) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// RAF-throttled scroll handler for 60 FPS UI rendering
export function createRafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let tick = false;
  let lastArgs: any[] | null = null;

  return ((...args: any[]) => {
    lastArgs = args;
    if (!tick) {
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      });
    }
  }) as unknown as T;
}
