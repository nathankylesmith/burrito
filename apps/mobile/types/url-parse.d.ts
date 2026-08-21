declare module 'url-parse' {
  interface URLParseInstance {
    protocol: string;
    username: string;
    password: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    hash: string;
    query: string | Record<string, unknown> | undefined;
    toString(): string;
    set(part: string, value: string): URLParseInstance;
  }

  interface URLParseConstructor {
    new (address: string, base?: string): URLParseInstance;
    (address: string, base?: string): URLParseInstance;
  }

  const URLParse: URLParseConstructor;
  export default URLParse;
}
