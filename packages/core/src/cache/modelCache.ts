import { ModelBundle } from '../types';

const DB_NAME = 'PythonReactML_Cache';
const STORE_NAME = 'models';
const DB_VERSION = 1;

interface CachedModel {
  key: string;
  data: ArrayBuffer;
  headers: {
    etag?: string | null;
    lastModified?: string | null;
    contentType?: string | null;
  };
  timestamp: number;
}

export class ModelCache {
  private db: IDBDatabase | null = null;
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof indexedDB !== 'undefined';
  }

  async initialize(): Promise<void> {
    if (!this.isSupported) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  async get(url: string): Promise<CachedModel | null> {
    if (!this.db) await this.initialize();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async put(url: string, data: ArrayBuffer, headers: Headers): Promise<void> {
    if (!this.db) await this.initialize();
    if (!this.db) return;

    const cachedItem: CachedModel = {
      key: url,
      data,
      headers: {
        etag: headers.get('etag'),
        lastModified: headers.get('last-modified'),
        contentType: headers.get('content-type'),
      },
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cachedItem);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async validateAndLoad(url: string): Promise<ArrayBuffer | null> {
    const cached = await this.get(url);
    if (!cached) return null;

    try {
      // Perform a HEAD request to check ETag/Last-Modified
      const response = await fetch(url, { method: 'HEAD' });
      
      const serverETag = response.headers.get('etag');
      const serverLastModified = response.headers.get('last-modified');

      if (serverETag && cached.headers.etag) {
        if (serverETag === cached.headers.etag) {
            console.log(`[Cache] Cache hit (ETag match): ${url}`);
            return cached.data;
        }
      } else if (serverLastModified && cached.headers.lastModified) {
        const serverDate = new Date(serverLastModified).getTime();
        const cachedDate = new Date(cached.headers.lastModified).getTime();
        if (serverDate <= cachedDate) {
            console.log(`[Cache] Cache hit (Not modified): ${url}`);
            return cached.data;
        }
      } else {
          // If no validation headers are present, we might want to respect cache-control or just assume stale?
          // For now, if we have it and can't validate, we might tentatively use it or re-fetch.
          // PROMPT says: "Check ETag/Hash headers. If the model hasn't changed on the server, load from disk immediately."
          // If headers don't exist on server, we can't be sure. Safe default is to re-fetch if we can't validate.
      }
      
      console.log(`[Cache] Cache miss (Changed or invalid): ${url}`);
      return null;
    } catch (error) {
      // Network error? Serve cached if available (Offline First approach)
        console.warn(`[Cache] Network validation failed, serving cached content:`, error);
        return cached.data;
    }
  }
}
