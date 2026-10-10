/**
 * 광장 프렌드 매치 게임 'mpj-plaza' — socket.io 네임스페이스 `/mpj-plaza`(방 입장 뒤) + HTTP 라우터 `/api/v1/mpj-plaza/*`(찾기·만들기·참가).
 * ddalkkakrider Game 계약 그대로(register(namespace, {every}) → {status, close}). 근거: docs/shell/online.md 9.5.
 */
import express from 'express';
import type { Router } from 'express';
import type { Game } from '../../socket';
import { API_BASE, PLAZA_GAME, WIRE_EVENT } from '@app/common/net/protocol/wire';
import { PlazaRooms, type PlazaRoomsOptions } from './rooms';

/** 방 상태 하나를 socket 게임과 HTTP 라우터가 함께 쓴다 */
export function createPlaza(opt: PlazaRoomsOptions = {}): { game: Game; router: () => Router; rooms: PlazaRooms } {
  const rooms = new PlazaRooms(opt);
  const game: Game = {
    id: PLAZA_GAME,
    register(namespace, { every }) {
      namespace.on('connection', (socket) => {
        const station = rooms.open(
          (bytes, volatile) => (volatile ? socket.volatile : socket).emit(WIRE_EVENT, bytes),
          () => socket.disconnect(),
        );
        socket.on(WIRE_EVENT, (data: unknown) => rooms.message(station, data));
        socket.on('disconnect', () => rooms.close(station));
      });
      every(250, () => rooms.tick());
      return { status: () => rooms.status() };
    },
  };
  const router = (): Router => {
    const r = express.Router();
    r.post(`${API_BASE}/:op`, express.raw({ type: () => true, limit: 1024 }), (req, res) => {
      const body = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array(0);
      const out = rooms.http(String(req.params.op), body);
      if (!out) {
        res.status(404).end();
        return;
      }
      res.type('application/octet-stream').send(Buffer.from(out));
    });
    return r;
  };
  return { game, router, rooms };
}

export const plaza = createPlaza();
export default plaza.game;
