const DEFAULT_MASK_CHAR = '•';

export function maskPassword(password: string, maskChar?: string): string {
  const char = maskChar ?? DEFAULT_MASK_CHAR;
  return char.repeat(password.length);
}

export function maskPartial(password: string, revealCount: number, maskChar?: string): string {
  const char = maskChar ?? DEFAULT_MASK_CHAR;
  if (revealCount <= 0) return char.repeat(password.length);
  if (password.length <= revealCount) return char.repeat(password.length);
  const masked = char.repeat(password.length - revealCount);
  return masked + password.slice(-revealCount);
}
