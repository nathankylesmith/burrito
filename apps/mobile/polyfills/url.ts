import URLParse from 'url-parse';

function supportsURLSearchParamsSet(): boolean {
  if (typeof globalThis.URLSearchParams === 'undefined') {
    return false;
  }

  try {
    const params = new URLSearchParams('test=1');
    params.set('test', '2');
    return params.get('test') === '2';
  } catch (error) {
    return false;
  }
}

type URLSearchParamsInit =
  | string
  | Record<string, unknown>
  | Array<[string, string]>
  | Iterable<[string, string]>;

function encode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

function decode(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function isIterable<T = unknown>(value: unknown): value is Iterable<T> {
  return typeof value === 'object' && value !== null && typeof (value as any)[Symbol.iterator] === 'function';
}

class PolyfilledURLSearchParams {
  private params: Array<{ key: string; value: string }> = [];

  constructor(init?: URLSearchParamsInit) {
    if (init === undefined || init === null) {
      return;
    }

    if (typeof init === 'string') {
      this.parseFromString(init);
      return;
    }

    if (Array.isArray(init)) {
      for (const entry of init) {
        if (Array.isArray(entry) && entry.length === 2) {
          this.append(String(entry[0]), String(entry[1]));
        }
      }
      return;
    }

    if (isIterable(init)) {
      for (const entry of init as Iterable<unknown>) {
        if (!Array.isArray(entry) || entry.length < 2) {
          continue;
        }

        const [key, value] = entry as [unknown, unknown];
        this.append(String(key), String(value));
      }
      return;
    }

    for (const [key, rawValue] of Object.entries(init as Record<string, unknown>)) {
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          this.append(String(key), value == null ? '' : String(value));
        }
        continue;
      }

      this.append(String(key), rawValue == null ? '' : String(rawValue));
    }
  }

  append(name: string, value: string): void {
    const key = String(name);
    const entryValue = String(value);
    this.params.push({ key, value: entryValue });
  }

  delete(name: string): void {
    const key = String(name);
    this.params = this.params.filter((param) => param.key !== key);
  }

  get(name: string): string | null {
    const key = String(name);
    const entry = this.params.find((param) => param.key === key);
    return entry ? entry.value : null;
  }

  getAll(name: string): string[] {
    const key = String(name);
    return this.params.filter((param) => param.key === key).map((param) => param.value);
  }

  has(name: string): boolean {
    const key = String(name);
    return this.params.some((param) => param.key === key);
  }

  set(name: string, value: string): void {
    const key = String(name);
    const entryValue = String(value);
    let replaced = false;

    for (let index = 0; index < this.params.length; index += 1) {
      const entry = this.params[index];
      if (entry.key !== key) {
        continue;
      }

      if (!replaced) {
        entry.value = entryValue;
        replaced = true;
        continue;
      }

      this.params.splice(index, 1);
      index -= 1;
    }

    if (!replaced) {
      this.append(key, entryValue);
    }
  }

  sort(): void {
    this.params.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  forEach(callback: (value: string, name: string, parent: PolyfilledURLSearchParams) => void, thisArg?: unknown): void {
    for (const { key, value } of this.params) {
      callback.call(thisArg, value, key, this);
    }
  }

  toString(): string {
    return this.params
      .map(({ key, value }) => `${encode(key)}=${encode(value)}`)
      .join('&');
  }

  private createIterator(kind: 'keys'): IterableIterator<string>;
  private createIterator(kind: 'values'): IterableIterator<string>;
  private createIterator(kind: 'entries'): IterableIterator<[string, string]>;
  private *createIterator(kind: 'keys' | 'values' | 'entries'): IterableIterator<string | [string, string]> {
    for (const { key, value } of this.params) {
      if (kind === 'keys') {
        yield key;
      } else if (kind === 'values') {
        yield value;
      } else {
        yield [key, value] as [string, string];
      }
    }
  }

  entries(): IterableIterator<[string, string]> {
    return this.createIterator('entries');
  }

  keys(): IterableIterator<string> {
    return this.createIterator('keys');
  }

  values(): IterableIterator<string> {
    return this.createIterator('values');
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  private parseFromString(init: string): void {
    const query = init.startsWith('?') ? init.substring(1) : init;

    if (!query) {
      return;
    }

    const pairs = query.split('&');
    for (const pair of pairs) {
      if (pair === '') {
        continue;
      }

      const separatorIndex = pair.indexOf('=');
      const rawKey = separatorIndex === -1 ? pair : pair.substring(0, separatorIndex);
      const rawValue = separatorIndex === -1 ? '' : pair.substring(separatorIndex + 1);
      const key = decode(rawKey);
      const value = decode(rawValue);
      this.append(key, value);
    }
  }
}

if (!supportsURLSearchParamsSet()) {
  (globalThis as Record<string, unknown>).URLSearchParams = PolyfilledURLSearchParams as unknown;
}

function urlSupportsProtocol(): boolean {
  try {
    const testUrl = new URL('https://example.com');
    // Check if protocol getter exists and works
    let protocolValue: string;
    try {
      protocolValue = testUrl.protocol;
    } catch (protocolError: any) {
      // If accessing protocol throws (e.g., "URL.protocol is not implemented"), we need polyfill
      if (protocolError?.message?.includes('protocol') || protocolError?.message?.includes('not implemented')) {
        return false;
      }
      throw protocolError;
    }

    if (typeof protocolValue !== 'string' || protocolValue.length === 0) {
      return false;
    }

    // Check if protocol setter works
    try {
      testUrl.protocol = 'http:';
      const updatedProtocol = testUrl.protocol;
      testUrl.protocol = protocolValue;
      return updatedProtocol === 'http:';
    } catch (setterError: any) {
      // If setting protocol throws, we need polyfill
      if (setterError?.message?.includes('protocol') || setterError?.message?.includes('not implemented')) {
        return false;
      }
      return false;
    }
  } catch (error) {
    return false;
  }
}

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;
type QueryRecord = Record<string, QueryValue>;

function normaliseQuery(query: string | QueryRecord | undefined): string {
  if (!query || (typeof query === 'object' && Object.keys(query).length === 0)) {
    return '';
  }

  if (typeof query === 'string') {
    return query.startsWith('?') ? query.substring(1) : query;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      params.append(key, '');
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry == null) {
          params.append(key, '');
        } else {
          params.append(key, String(entry));
        }
      }
      continue;
    }

    params.append(key, String(value));
  }

  return params.toString();
}

function ensureLeading(value: string, token: string): string {
  if (!value) {
    return '';
  }

  return value.startsWith(token) ? value : `${token}${value}`;
}

if (typeof globalThis.URL === 'undefined' || !urlSupportsProtocol()) {
  class PolyfilledURL {
    private internal: any;

    constructor(input: string, base?: string) {
      if (base !== undefined) {
        this.internal = new URLParse(input, base);
      } else {
        this.internal = new URLParse(input);
      }
    }

    private updateFrom(value: string) {
      this.internal = new URLParse(value);
    }

    get href(): string {
      return this.internal.toString();
    }

    set href(value: string) {
      this.updateFrom(value);
    }

    get protocol(): string {
      return this.internal.protocol || '';
    }

    set protocol(value: string) {
      this.internal.set('protocol', value);
    }

    get username(): string {
      return this.internal.username || '';
    }

    set username(value: string) {
      this.internal.set('username', value);
    }

    get password(): string {
      return this.internal.password || '';
    }

    set password(value: string) {
      this.internal.set('password', value);
    }

    get host(): string {
      return this.internal.host || '';
    }

    set host(value: string) {
      this.internal.set('host', value);
    }

    get hostname(): string {
      return this.internal.hostname || '';
    }

    set hostname(value: string) {
      this.internal.set('hostname', value);
    }

    get port(): string {
      return this.internal.port || '';
    }

    set port(value: string) {
      this.internal.set('port', value);
    }

    get pathname(): string {
      return this.internal.pathname || '';
    }

    set pathname(value: string) {
      this.internal.set('pathname', value);
    }

    get search(): string {
      const query = normaliseQuery(this.internal.query as string | QueryRecord | undefined);
      return query ? `?${query}` : '';
    }

    set search(value: string) {
      const normalised = value.startsWith('?') ? value.substring(1) : value;
      this.internal.set('query', normalised);
    }

    get hash(): string {
      return ensureLeading(this.internal.hash || '', '#');
    }

    set hash(value: string) {
      this.internal.set('hash', ensureLeading(value, '#'));
    }

    get origin(): string {
      const protocol = this.protocol;
      const host = this.host;

      if (!host) {
        return 'null';
      }

      return `${protocol}//${host}`;
    }

    get searchParams(): URLSearchParams {
      const query = this.search;
      return new URLSearchParams(query.startsWith('?') ? query.substring(1) : query);
    }

    toString(): string {
      return this.href;
    }

    valueOf(): string {
      return this.href;
    }
  }

  (globalThis as Record<string, unknown>).URL = PolyfilledURL;
}
