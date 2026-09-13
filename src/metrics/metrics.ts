import { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Node runtime metrics (CPU, memory, event loop, GC, ...).
collectDefaultMetrics();

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const requestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req.route?.path as string | undefined) ?? 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    requestDuration.observe(labels, seconds);
    requestsTotal.inc(labels);
  });
  next();
}
