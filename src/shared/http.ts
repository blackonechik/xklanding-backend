export function readString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return undefined
  }

  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' ? raw : undefined
}
