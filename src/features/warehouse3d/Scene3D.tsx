import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { DbState } from '@/domain/state';
import type { ID } from '@/domain/types';
import { colorFor, SPECIAL, type BinView, type Mode } from './model';

export interface SceneHandle {
  reset: () => void;
  focus: (x: number, z: number) => void;
}

const HOME = { pos: new THREE.Vector3(70, 46, 74), target: new THREE.Vector3(30, 0, 18) };

export interface Overlay {
  id: string;
  pos: [number, number, number];
}

/** Projects 3D anchor points to DOM overlay elements every frame (no extra React roots). */
function Projector({ overlays, els }: { overlays: Overlay[]; els: React.MutableRefObject<Record<string, HTMLElement | null>> }) {
  const { camera, size } = useThree();
  const v = React.useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const o of overlays) {
      const el = els.current[o.id];
      if (!el) continue;
      v.set(o.pos[0], o.pos[1], o.pos[2]).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.opacity = v.z < 1 && x > -40 && x < size.width + 40 ? '1' : '0';
    }
  });
  return null;
}

function Bins({ views, mode, dark, highlight, onSelect, selectedBin, onHover }: { views: BinView[]; mode: Mode; dark: boolean; highlight: Set<ID>; onSelect: (v: BinView) => void; selectedBin?: ID | null; onHover?: (v: BinView | null) => void }) {
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const dummy = React.useMemo(() => new THREE.Object3D(), []);
  const color = React.useMemo(() => new THREE.Color(), []);
  React.useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    views.forEach((v, i) => {
      const fill = v.items.length ? Math.max(0.25, Math.min(1, v.occupancy)) : 0.12;
      dummy.position.set(v.pos[0], v.pos[1] - (v.size[1] * (1 - fill)) / 2, v.pos[2]);
      dummy.scale.set(v.size[0], v.size[1] * fill, v.size[2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      color.set(colorFor(v, mode, dark, highlight));
      if (i === hover || v.bin.id === selectedBin) color.offsetHSL(0, 0, dark ? 0.15 : -0.12);
      m.setColorAt(i, color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [views, mode, dark, highlight, hover, selectedBin, dummy, color]);
  React.useEffect(() => {
    onHover?.(hover !== null ? views[hover] : null);
  }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, views.length]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(e.instanceId ?? null);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(null);
          document.body.style.cursor = '';
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onSelect(views[e.instanceId]);
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.65} metalness={0.05} />
      </instancedMesh>
    </>
  );
}

function RackFrames({ db, low }: { db: DbState; low: boolean }) {
  const racks = Object.values(db.racks).filter((r) => r.type !== 'floor');
  return (
    <group>
      {racks.map((r) => {
        const levelH = r.h / r.levels;
        const upCol = r.type === 'shelving' ? '#7a8f86' : '#1f5c8a';
        const beamCol = r.type === 'cantilever' ? '#1f5c8a' : '#e0702a';
        return (
          <group key={r.id}>
            {Array.from({ length: r.bays + 1 }, (_, i) => (
              <mesh key={`u${i}`} position={[r.x + (i * r.w) / r.bays, r.h / 2, r.z]}>
                <boxGeometry args={[0.09, r.h, r.d]} />
                <meshStandardMaterial color={upCol} />
              </mesh>
            ))}
            {!low &&
              Array.from({ length: r.levels }, (_, l) => (
                <mesh key={`b${l}`} position={[r.x + r.w / 2, l * levelH + 0.04, r.z]}>
                  <boxGeometry args={[r.w, 0.07, r.d * 1.02]} />
                  <meshStandardMaterial color={beamCol} />
                </mesh>
              ))}
          </group>
        );
      })}
    </group>
  );
}

function Building({ db, dark }: { db: DbState; dark: boolean }) {
  const wh = Object.values(db.warehouses)[0];
  const W = wh?.width ?? 60;
  const D = wh?.depth ?? 36;
  const zoneCol = (k: string) => (k === 'storage' ? (dark ? '#1b3d32' : '#e3f3ea') : k === 'quarantine' ? (dark ? '#42262a' : '#fbe7e6') : dark ? '#1c2f45' : '#e5effb');
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W + 4, D + 4]} />
        <meshStandardMaterial color={dark ? '#13261f' : '#eef3f0'} />
      </mesh>
      <gridHelper args={[66, 66, dark ? '#2a4a40' : '#d2ddd6', dark ? '#1d3830' : '#e2eae5']} position={[W / 2, 0.005, D / 2]} />
      {Object.values(db.zones).map((z) => (
        <mesh key={z.id} rotation={[-Math.PI / 2, 0, 0]} position={[z.x + z.w / 2, 0.01, z.z + z.d / 2]}>
          <planeGeometry args={[z.w, z.d]} />
          <meshStandardMaterial color={zoneCol(z.kind)} transparent opacity={0.85} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.015, 17.8]}>
        <planeGeometry args={[W, 1.8]} />
        <meshStandardMaterial color={dark ? '#e7b04f' : '#f2c76b'} transparent opacity={0.35} />
      </mesh>
      {/* low perimeter walls keep the view open */}
      {[
        [W / 2, 0, W, 0.2],
        [W / 2, D, W, 0.2],
        [0, D / 2, 0.2, D],
        [W, D / 2, 0.2, D],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.35, z]}>
          <boxGeometry args={[w, 0.7, d]} />
          <meshStandardMaterial color={dark ? '#335549' : '#c8d8cd'} />
        </mesh>
      ))}
      {/* dock doors */}
      {[2, 5, 8].map((x) => (
        <mesh key={`dd${x}`} position={[x, 1.2, -0.05]}>
          <boxGeometry args={[2.2, 2.4, 0.1]} />
          <meshStandardMaterial color="#1f5c8a" />
        </mesh>
      ))}
      {[52, 55, 58].map((x) => (
        <mesh key={`ld${x}`} position={[x, 1.2, -0.05]}>
          <boxGeometry args={[2.2, 2.4, 0.1]} />
          <meshStandardMaterial color="#e0702a" />
        </mesh>
      ))}
      {/* staging pallets & dock pallets */}
      {[
        [53, 5],
        [55.5, 5],
        [58, 5],
        [53, 8],
        [55.5, 8],
      ].map(([x, z], i) => (
        <mesh key={`sp${i}`} position={[x, 0.35, z]}>
          <boxGeometry args={[1.6, 0.7, 1.2]} />
          <meshStandardMaterial color={dark ? '#b07a45' : '#c9955c'} />
        </mesh>
      ))}
      {[
        [3, 4],
        [6, 4],
      ].map(([x, z], i) => (
        <mesh key={`dp${i}`} position={[x, 0.3, z]}>
          <boxGeometry args={[1.6, 0.6, 1.2]} />
          <meshStandardMaterial color={dark ? '#6a8f82' : '#a9c2b6'} />
        </mesh>
      ))}
    </group>
  );
}

function Forklift({ path, run }: { path: THREE.Vector3[]; run: number }) {
  const ref = React.useRef<THREE.Group>(null);
  const t = React.useRef(0);
  React.useEffect(() => {
    t.current = 0;
  }, [run]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || path.length < 2) return;
    if (run > 0) t.current = Math.min(1, t.current + dt / 6);
    const total = path.length - 1;
    const f = t.current * total;
    const i = Math.min(total - 1, Math.floor(f));
    const a = path[i];
    const b = path[i + 1];
    g.position.lerpVectors(a, b, f - i);
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.lengthSq() > 0.001) g.rotation.y = Math.atan2(dir.x, dir.z);
  });
  return (
    <group ref={ref} position={path[0]}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.1, 0.8, 1.6]} />
        <meshStandardMaterial color="#F08B46" />
      </mesh>
      <mesh position={[0, 1.25, -0.2]}>
        <boxGeometry args={[0.9, 0.6, 0.8]} />
        <meshStandardMaterial color="#103F34" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, 1.3, 0.85]}>
        <boxGeometry args={[0.9, 2.2, 0.12]} />
        <meshStandardMaterial color="#3a4f47" />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.2, 1.4]}>
          <boxGeometry args={[0.12, 0.06, 1]} />
          <meshStandardMaterial color="#3a4f47" />
        </mesh>
      ))}
      {[
        [-0.55, 0.62],
        [0.55, 0.62],
        [-0.55, -0.55],
        [0.55, -0.55],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 12]} />
          <meshStandardMaterial color="#172B25" />
        </mesh>
      ))}
    </group>
  );
}

function ReceivingCrate({ path, onDone, run }: { path: THREE.Vector3[]; onDone: () => void; run: number }) {
  const ref = React.useRef<THREE.Mesh>(null);
  const t = React.useRef(0);
  const done = React.useRef(false);
  React.useEffect(() => {
    t.current = 0;
    done.current = false;
  }, [run]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m || path.length < 2) return;
    t.current = Math.min(1, t.current + dt / 3.2);
    const total = path.length - 1;
    const f = t.current * total;
    const i = Math.min(total - 1, Math.floor(f));
    m.position.lerpVectors(path[i], path[i + 1], f - i);
    m.rotation.y += dt * 1.2;
    if (t.current >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <mesh ref={ref} position={path[0]}>
      <boxGeometry args={[0.9, 0.7, 0.9]} />
      <meshStandardMaterial color="#2a78d6" emissive="#2a78d6" emissiveIntensity={0.35} />
    </mesh>
  );
}

function RouteLine({ points, animate }: { points: [number, number][]; animate: boolean }) {
  const ref = React.useRef<{ material: { dashOffset: number } }>(null);
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.material.dashOffset -= dt * 3;
  });
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0.12, z));
  if (pts.length < 2) return null;
  return <Line ref={ref as never} points={pts} color="#F08B46" lineWidth={4} dashed dashSize={0.9} gapSize={0.5} />;
}

export const Scene3D = React.forwardRef<SceneHandle, {
  db: DbState;
  views: BinView[];
  mode: Mode;
  dark: boolean;
  highlight: Set<ID>;
  route?: { points: [number, number][]; stops: BinView[] };
  selectedBin?: ID | null;
  onSelect: (v: BinView) => void;
  lowPower: boolean;
  animate: boolean;
  forkliftRun: number;
  receiving?: { target: BinView; run: number };
  onReceivingDone?: () => void;
  onHover?: (v: BinView | null) => void;
  overlays: Overlay[];
  overlayEls: React.MutableRefObject<Record<string, HTMLElement | null>>;
}>(function Scene3D(props, ref) {
  const { db, views, mode, dark, highlight, route, selectedBin, onSelect, lowPower, animate, forkliftRun, receiving, onReceivingDone, onHover, overlays, overlayEls } = props;
  const controls = React.useRef<OrbitControlsImpl>(null);
  React.useImperativeHandle(ref, () => ({
    reset: () => {
      const c = controls.current;
      if (!c) return;
      c.object.position.copy(HOME.pos);
      c.target.copy(HOME.target);
      c.update();
    },
    focus: (x: number, z: number) => {
      const c = controls.current;
      if (!c) return;
      c.target.set(x, 1, z);
      c.object.position.set(x + 14, 14, z + 16);
      c.update();
    },
  }));
  const forkPath = React.useMemo(() => {
    const target = route?.stops[0] ?? views.find((v) => highlight.has(v.bin.id)) ?? views[40];
    if (!target) return [];
    return [
      [SPECIAL.dock[0], 0, SPECIAL.dock[2] + 3],
      [SPECIAL.dock[0], 0, 17.8],
      [target.pos[0], 0, 17.8],
      [target.pos[0], 0, target.rack && target.zoneCode === 'C' ? target.pos[2] + 2.2 : target.pos[2] - 2],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  }, [route, views, highlight]);
  const crate = React.useMemo(() => {
    if (!receiving) return [];
    const t = receiving.target;
    const az = t.zoneCode === 'C' ? t.pos[2] + 2.2 : t.pos[2] - 2;
    return [
      [SPECIAL.dock[0], 0.6, SPECIAL.dock[2]],
      [SPECIAL.dock[0], 1.5, 17.8],
      [t.pos[0], 1.5, 17.8],
      [t.pos[0], Math.max(1.5, t.pos[1]), az],
      [t.pos[0], t.pos[1], t.pos[2]],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  }, [receiving]);
  return (
    <Canvas camera={{ position: HOME.pos.toArray(), fov: 38, near: 0.5, far: 400 }} dpr={lowPower ? 1 : [1, 1.75]} gl={{ antialias: !lowPower, powerPreference: lowPower ? 'low-power' : 'high-performance' }} frameloop={animate || receiving || forkliftRun ? 'always' : 'demand'}>
      <color attach="background" args={[dark ? '#0f1e1a' : '#f5f8f6']} />
      <hemisphereLight args={[dark ? '#b8e6d2' : '#ffffff', dark ? '#0f1e1a' : '#c8d8cd', 0.8]} />
      <directionalLight position={[40, 60, 30]} intensity={1.1} />
      <ambientLight intensity={0.35} />
      <Building db={db} dark={dark} />
      <RackFrames db={db} low={lowPower} />
      <Bins views={views} mode={mode} dark={dark} highlight={highlight} onSelect={onSelect} selectedBin={selectedBin} onHover={onHover} />
      <Projector overlays={overlays} els={overlayEls} />
      {route && mode === 'route' && <RouteLine points={route.points} animate={animate} />}
      {route &&
        mode === 'route' &&
        route.stops.map((st) => (
          <group key={st.bin.id} position={[st.pos[0], 0, st.pos[2] + (st.zoneCode === 'C' ? 1.4 : -1.4)]}>
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 2.2, 8]} />
              <meshStandardMaterial color="#F08B46" />
            </mesh>
            <mesh position={[0, 2.3, 0]}>
              <sphereGeometry args={[0.32, 16, 12]} />
              <meshStandardMaterial color="#F08B46" emissive="#F08B46" emissiveIntensity={0.3} />
            </mesh>
          </group>
        ))}
      {forkliftRun > 0 && <Forklift path={forkPath} run={forkliftRun} />}
      {receiving && crate.length > 1 && <ReceivingCrate path={crate} run={receiving.run} onDone={() => onReceivingDone?.()} />}
      <OrbitControls ref={controls as never} makeDefault target={HOME.target} enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.15} minDistance={8} maxDistance={120} />
    </Canvas>
  );
});

export default Scene3D;
