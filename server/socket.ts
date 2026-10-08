/**
 * socket.io 서버 하나 + 게임별 네임스페이스 — ddalkkakrider `scripts/server/socket.ts` 와 같은 계약(createSocket·guard·Game.register(namespace, context)).
 * 근거: docs/shell/online.md 9.5. 게임 목록은 ./games.ts.
 */
import type { Server as HttpServer } from 'node:http';
import { createRequire } from 'node:module';
import type { Namespace, ServerOptions, Socket } from '../node_modules/socket.io/dist/index';
import { games as registered } from './games';

const { Server } = createRequire(import.meta.url)('socket.io') as typeof import('../node_modules/socket.io/dist/index');

export type GameContext = {
  every(ms: number, task: () => void): void;
};

export type GameHandle = {
  status(): unknown;
  close?(): void | Promise<void>;
};

export type Game = {
  id: string;
  register(namespace: Namespace, context: GameContext): GameHandle;
};

export type Report = (game: string, error: unknown) => void;

export type SocketOptions = Partial<ServerOptions> & {
  games?: Game[];
  report?: Report;
};

const ENGINE: Partial<ServerOptions> = {
  maxHttpBufferSize: 8192,
  pingInterval: 5000,
  pingTimeout: 10000,
};

const log: Report = (game, error) => console.error(`[${game}]`, error);

function guard(game: Game, report: Report) {
  return (socket: Socket, next: (error?: Error) => void) => {
    const on = socket.on.bind(socket);
    const fail = (error: unknown) => {
      report(game.id, error);
      socket.disconnect();
    };
    socket.on = ((event: string, listener: (...args: unknown[]) => unknown) =>
      on(event, (...args: unknown[]) => {
        try {
          const result = listener(...args);
          if (result instanceof Promise) result.catch(fail);
        } catch (error) {
          fail(error);
        }
      })) as Socket['on'];
    next();
  };
}

export function createSocket(http: HttpServer, { games = registered, report = log, ...engine }: SocketOptions = {}) {
  const io = new Server(http, { ...ENGINE, ...engine });
  const timers: ReturnType<typeof setInterval>[] = [];
  const handles = new Map<string, GameHandle>();
  for (const game of games) {
    const namespace = io.of(`/${game.id}`);
    namespace.use(guard(game, report));
    const context: GameContext = {
      every(ms, task) {
        let last = '';
        timers.push(
          setInterval(() => {
            try {
              task();
              last = '';
            } catch (error) {
              if (String(error) !== last) report(game.id, error);
              last = String(error);
            }
          }, ms),
        );
      },
    };
    handles.set(game.id, game.register(namespace, context));
  }
  return {
    io,
    status: (id: string) => handles.get(id)?.status(),
    close: async () => {
      timers.forEach(clearInterval);
      for (const handle of handles.values()) await handle.close?.();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
