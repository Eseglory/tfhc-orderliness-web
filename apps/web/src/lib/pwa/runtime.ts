export interface PwaRuntime {
  get(store: string, id: string): Promise<any>;
  put(store: string, value: any): Promise<any>;
  remove(store: string, id: string): Promise<void>;
  setAccount(owner: string, expiresAt: number): Promise<void>;
  configure(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  isUnlocked(): boolean;
  save(name: string, value: unknown, expectedRevision?: number, kind?: string, ttl?: number): Promise<number>;
  read(name: string): Promise<{ value: any; revision: number; savedAt: number } | null>;
  list(): Promise<{ name: string; kind: string; savedAt: number; revision: number }[]>;
  deleteRecord(name: string): Promise<void>;
  clearPrivate(): Promise<void>;
  receive(files: File[], text?: string): Promise<string>;
  inbox(): Promise<{ id: string; files: File[]; text: string }[]>;
}
let loading: Promise<PwaRuntime> | undefined;
export function pwaRuntime(): Promise<PwaRuntime> {
  if ((globalThis as any).TFHCPwa) return Promise.resolve((globalThis as any).TFHCPwa);
  return loading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/pwa-runtime.js';
    script.onload = () => resolve((globalThis as any).TFHCPwa);
    script.onerror = () => { loading = undefined; reject(new Error('Offline storage could not start.')); };
    document.head.appendChild(script);
  });
}
