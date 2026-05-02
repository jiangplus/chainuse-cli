// Alchemy provider implementation
// The actual client building is in providers/index.ts via buildPublicClient
// This module exports Alchemy-specific helpers if needed

export function buildAlchemyUrl(baseUrl: string, apiKey: string): string {
  return `${baseUrl}/${apiKey}`
}

export function isAlchemyUrl(url: string): boolean {
  return url.includes('alchemy.com')
}
