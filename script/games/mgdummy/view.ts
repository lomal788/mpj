/**
 * 시험용 더미 미니게임 3D — 원본 에셋이 아닌 확인용 최소 장면(바닥 + 플레이어별 기둥, 높이 = 점수). 틀의 2D UI 가 이 위에 겹친다.
 * 오프닝(단계 4) 동안은 카메라가 돈다(건너뛰기 확인용). 기둥 색은 플레이어 번호 표시용 임의 색 [설계: 원본 없음].
 */
import * as THREE from 'three';
import type { DummyState } from './logic';

const COLORS = [0xe0402a, 0x2a7ee0, 0x2ab04a, 0xe0c02a];

export class DummyView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private readonly bars: THREE.Mesh[] = [];

  constructor() {
    this.scene.background = new THREE.Color(0x87a8c8);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(3, 8, 5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x9a8a6a }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: COLORS[i] }));
      m.position.set(-4.5 + i * 3, 0.5, 0);
      this.scene.add(m);
      this.bars.push(m);
    }
  }

  update(state: DummyState, stage: number, frame: number): void {
    state.scores.forEach((s, i) => {
      const h = 0.2 + s * 0.06;
      const b = this.bars[i];
      if (!b) return;
      b.scale.y = h;
      b.position.y = h / 2;
    });
    if (stage <= 4) {
      const a = frame * 0.01;
      this.camera.position.set(Math.sin(a) * 12, 5, Math.cos(a) * 12);
    } else this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, 1, 0);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}
