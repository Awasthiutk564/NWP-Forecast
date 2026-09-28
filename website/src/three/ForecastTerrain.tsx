import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { valueColor } from "../lib/colors";
import type { District, Grid, GridInfo, Var } from "../lib/data";

export const CENTER = { lon: 80.5, lat: 16 };
const FOOT = 0.215; // column footprint in degrees (grid spacing is 0.25)

/** Column height in scene units. Rain uses a square-root scale so a 244 mm cyclone and a 5 mm shower both stay readable. */
export function heightOf(v: number, variable: Var) {
  if (variable === "rain") return 0.03 + Math.sqrt(Math.max(0, v)) * 0.12;
  return 0.03 + Math.max(0, v - 24) * 0.04;
}

export interface HoverInfo { index: number; lat: number; lon: number; value: number | null; district: string | null }

interface TerrainProps {
  grid: GridInfo;
  values: Grid | null;
  variable: Var;
  districts?: District[] | null;
  onHover?: (h: HoverInfo | null) => void;
}

function nearestDistrict(districts: District[] | null | undefined, lon: number, lat: number) {
  if (!districts) return null;
  // point-in-polygon on the outer rings, falling back to the nearest centroid
  for (const d of districts) {
    for (const ring of d.rings) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return d.name;
    }
  }
  return null;
}

function Columns({ grid, values, variable, districts, onHover }: TerrainProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef<number | null>(null);

  // Land points only: one instance per grid cell that IMD covers.
  const cells = useMemo(() => {
    const out: { idx: number; x: number; z: number; lat: number; lon: number }[] = [];
    grid.lat.forEach((la, i) => grid.lon.forEach((lo, j) => {
      const idx = i * grid.lon.length + j;
      if (grid.land[idx]) out.push({ idx, x: lo - CENTER.lon, z: -(la - CENTER.lat), lat: la, lon: lo });
    }));
    return out;
  }, [grid]);

  const current = useRef<Float32Array>(new Float32Array(0));
  const target = useRef<Float32Array>(new Float32Array(0));
  const colors = useRef<Float32Array>(new Float32Array(0));
  const targetColors = useRef<Float32Array>(new Float32Array(0));

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(FOOT, 1, FOOT);
    g.translate(0, 0.5, 0);
    return g;
  }, []);

  useEffect(() => {
    const n = cells.length;
    if (current.current.length !== n) {
      current.current = new Float32Array(n).fill(0.02);
      colors.current = new Float32Array(n * 3).fill(0.1);
    }
    target.current = new Float32Array(n);
    targetColors.current = new Float32Array(n * 3);
    cells.forEach((c, k) => {
      const v = values?.[c.idx];
      const ok = v != null && isFinite(v);
      target.current[k] = ok ? heightOf(v as number, variable) : 0.02;
      const [r, g, b] = ok ? valueColor(v as number, variable) : [30, 36, 46];
      targetColors.current.set([r / 255, g / 255, b / 255], k * 3);
    });
  }, [cells, values, variable]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const inst = mesh.current;
    if (!inst || target.current.length !== cells.length) return;
    const k = 1 - Math.pow(0.0015, dt); // frame-rate independent easing
    for (let i = 0; i < cells.length; i++) {
      current.current[i] += (target.current[i] - current.current[i]) * k;
      for (let c = 0; c < 3; c++) colors.current[i * 3 + c] += (targetColors.current[i * 3 + c] - colors.current[i * 3 + c]) * k;
      const cell = cells[i];
      m4.makeScale(1, current.current[i], 1).setPosition(cell.x, 0, cell.z);
      inst.setMatrixAt(i, m4);
      const lift = hovered.current === i ? 0.35 : 0;
      col.setRGB(colors.current[i * 3] + lift, colors.current[i * 3 + 1] + lift, colors.current[i * 3 + 2] + lift);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i == null) return;
    hovered.current = i;
    const c = cells[i];
    const v = values?.[c.idx];
    onHover?.({ index: c.idx, lat: c.lat, lon: c.lon, value: v ?? null, district: nearestDistrict(districts, c.lon, c.lat) });
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, cells.length]}
      onPointerMove={onHover ? move : undefined}
      onPointerOut={onHover ? () => { hovered.current = null; onHover(null); } : undefined}
    >
      <meshStandardMaterial roughness={0.42} metalness={0.08} toneMapped={false} />
    </instancedMesh>
  );
}

function DistrictLines({ districts, opacity = 0.32 }: { districts: District[]; opacity?: number }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    districts.forEach((d) => d.rings.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        pts.push(a[0] - CENTER.lon, 0.004, -(a[1] - CENTER.lat), b[0] - CENTER.lon, 0.004, -(b[1] - CENTER.lat));
      }
    }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [districts]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#dfe8f6" transparent opacity={opacity} />
    </lineSegments>
  );
}

function Base() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
        <planeGeometry args={[12, 11]} />
        <meshStandardMaterial color="#0b111a" roughness={1} />
      </mesh>
      <gridHelper args={[12, 48, "#1b2533", "#121a25"]} position-y={0} />
    </group>
  );
}

/** Pauses rendering while the scene is off screen and reliably restarts it when it comes back. */
function RenderLoop({ active }: { active: boolean }) {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setFrameloop(active ? "always" : "never");
    if (active) invalidate();
  }, [active, setFrameloop, invalidate]);
  return null;
}

export interface SceneHandle { reset: () => void }

interface SceneProps extends TerrainProps {
  autoRotate?: boolean;
  interactive?: boolean;
  camera?: [number, number, number];
  active?: boolean;
  districtOpacity?: number;
}

/** The 3-D grid: one column per 0.25° IMD cell over AP & Telangana, district lines on the floor. */
export const ForecastScene = forwardRef<SceneHandle, SceneProps>(function ForecastScene(
  { autoRotate, interactive = true, camera = [0.3, 11.8, 13.2], active = true, districtOpacity, ...terrain }, ref,
) {
  const controls = useRef<OrbitControlsImpl>(null);
  useImperativeHandle(ref, () => ({ reset: () => controls.current?.reset() }), []);
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="always"
      camera={{ position: camera, fov: 36, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ touchAction: interactive ? "none" : "auto" }}
    >
      <RenderLoop active={active} />
      <fog attach="fog" args={["#070a0f", 14, 26]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#bcd4ff", "#1a1206", 0.6]} />
      <directionalLight position={[4, 9, 5]} intensity={1.6} />
      <directionalLight position={[-6, 4, -4]} intensity={0.5} color="#ffb070" />
      <Base />
      {terrain.districts && <DistrictLines districts={terrain.districts} opacity={districtOpacity} />}
      <Columns {...terrain} />
      <OrbitControls
        ref={controls}
        enabled={interactive}
        enablePan={false}
        enableZoom={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        minPolarAngle={0.35}
        maxPolarAngle={1.2}
        target={[0, 0.3, 0.6]}
      />
    </Canvas>
  );
});
