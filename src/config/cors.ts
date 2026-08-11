export function getCorsOrigins(): string[] | string {
  return process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000';
}
