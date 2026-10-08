/**
 * HTTP API — ddalkkakrider `scripts/server/api/index.mjs` 의 createApp(fallback) 과 같은 꼴(express 5, 오류 처리기, 끝에 정적 fallback).
 * 로그인 라우터 대신 게임 라우터(`/api/v1/<게임 id>/…`)를 붙인다. 근거: docs/shell/online.md 9.5.
 */
import { STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import { routers as registered } from '../games';

export function createApp(fallback: (req: IncomingMessage, res: ServerResponse) => void, routers: (() => Router)[] = registered) {
  const app = express();
  app.disable('x-powered-by');
  for (const r of routers) app.use(r());
  app.use((req: Request, res: Response) => fallback(req, res));
  app.use((err: { status?: number }, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
    if (res.headersSent) {
      req.socket.destroy();
      return;
    }
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).type('text/plain').send(STATUS_CODES[status]);
  });
  return app;
}
