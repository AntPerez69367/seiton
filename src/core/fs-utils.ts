export function dirOf(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.slice(0, lastSlash) : '/';
}
