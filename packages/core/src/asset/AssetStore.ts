import type { Manifest, ManifestEntry } from "./Manifest";

/** Minimaler `fetch`-Ausschnitt; im Browser `globalThis.fetch`, in Tests ein Stub. */
export type Fetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * Zugriff auf generierte Assets über ihre stabile ID. Die Shell erzeugt den Store,
 * das Spiel fordert nur IDs an und kennt weder Dateinamen noch Hashes.
 */
export class AssetStore {
  private readonly byId: ReadonlyMap<string, ManifestEntry>;
  private readonly cache = new Map<string, Promise<Uint8Array>>();

  constructor(
    readonly manifest: Manifest,
    /** Basis-URL des Manifests, mit abschließendem `/`. */
    private readonly baseUrl: string,
    private readonly fetchFn: Fetch,
  ) {
    this.byId = new Map(manifest.entries.map((e) => [e.id, e]));
  }

  static async load(manifestUrl: string, fetchFn: Fetch): Promise<AssetStore> {
    const res = await fetchFn(manifestUrl);
    if (!res.ok) throw new Error(`Manifest ${manifestUrl}: HTTP ${res.status}`);
    const manifest = JSON.parse(new TextDecoder().decode(await res.arrayBuffer())) as Manifest;
    return new AssetStore(
      manifest,
      manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1),
      fetchFn,
    );
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  entry(id: string): ManifestEntry {
    const e = this.byId.get(id);
    if (!e) throw new Error(`Asset ${id} steht nicht im Manifest`);
    return e;
  }

  url(id: string): string {
    return this.baseUrl + this.entry(id).file;
  }

  bytes(id: string): Promise<Uint8Array> {
    let p = this.cache.get(id);
    if (!p) {
      const url = this.url(id);
      p = this.fetchFn(url).then(async (res) => {
        if (!res.ok) throw new Error(`Asset ${id} (${url}): HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      });
      p.catch(() => this.cache.delete(id));
      this.cache.set(id, p);
    }
    return p;
  }

  async json<T>(id: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.bytes(id))) as T;
  }

  /** IDs aller Assets eines Bundles, sortiert. */
  bundle(name: string): string[] {
    return this.manifest.entries.filter((e) => e.bundles.includes(name)).map((e) => e.id);
  }

  /**
   * Lädt alle Assets der Bundles vorab in den Speicher (Ladebildschirm).
   * `onProgress(geladen, gesamt)` zählt Bytes laut Manifest, einmal zu Beginn
   * und nach jedem fertigen Asset. Höchstens `parallel` Anfragen gleichzeitig.
   */
  async preload(
    bundles: readonly string[],
    onProgress?: (loaded: number, total: number) => void,
    parallel = 6,
  ): Promise<void> {
    const ids = [...new Set(bundles.flatMap((b) => this.bundle(b)))];
    const total = ids.reduce((sum, id) => sum + this.entry(id).bytes, 0);
    let loaded = 0;
    onProgress?.(0, total);
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++] as string;
        await this.bytes(id);
        loaded += this.entry(id).bytes;
        onProgress?.(loaded, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, ids.length) }, worker));
  }
}
