"use client";

import type { Group, Mesh } from "three";
import { useEffect, useRef, useState } from "react";

/**
 * EMA parfüm şişesinin interaktif 3D görüntüleyicisi (three.js · OBJ).
 * Sürükleyerek döndürülür, kendiliğinden yavaşça döner. Yüklenene kadar poster (render) görünür.
 * Model: /ema/ema-parfum-50ml.obj (green_glass gövde, gold kapak, clear_glass).
 */
export function BottleViewer({
  className,
  objUrl = "/ema/ema-parfum-50ml.obj",
  glassColor = 0x0c3b2b,
  poster = "/ema/ema-bottle.png",
}: {
  className?: string;
  /** Model geometrisi (public/ema/…obj). */
  objUrl?: string;
  /** Gövde camının rengi (yeşil, kobalt, kristal…). Hex sayı. */
  glassColor?: number;
  poster?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setReady(false);
    setFailed(false);

    (async () => {
      try {
        const THREE = await import("three");
        const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
        const mount = mountRef.current;
        if (disposed || !mount) return;

        const width = mount.clientWidth || 320;
        const height = mount.clientHeight || 380;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 100);
        camera.position.set(0, 0.02, 0.28);

        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(0.3, 0.6, 0.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xfff2d6, 1.4);
        rim.position.set(-0.4, 0.2, -0.5);
        scene.add(rim);
        scene.add(new THREE.AmbientLight(0xffffff, 0.35));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 0.16;
        controls.maxDistance = 0.5;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.6;

        const gold = new THREE.MeshPhysicalMaterial({ color: 0xcaa24a, metalness: 1, roughness: 0.28, clearcoat: 0.6 });
        const chrome = new THREE.MeshPhysicalMaterial({ color: 0xcdd0d4, metalness: 1, roughness: 0.18 });
        const gunmetal = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.9, roughness: 0.4 });
        // Gövde camı: modele göre renk (yeşil / kobalt / kristal…).
        const bodyGlass = new THREE.MeshPhysicalMaterial({
          color: glassColor,
          metalness: 0,
          roughness: 0.08,
          transmission: 0.55,
          thickness: 4,
          ior: 1.5,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          transparent: true,
          opacity: 0.95,
        });
        const clearGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 0.92, thickness: 1.2, ior: 1.5, transparent: true, opacity: 0.6 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x1c1712, metalness: 0.3, roughness: 0.6 });
        const label = new THREE.MeshStandardMaterial({ color: 0xc9a25e, metalness: 0.5, roughness: 0.4 });
        const linen = new THREE.MeshStandardMaterial({ color: 0xefe7d6, metalness: 0, roughness: 0.9 });
        const wood = new THREE.MeshStandardMaterial({ color: 0xb98a52, metalness: 0, roughness: 0.6 });

        const pick = (name: string) => {
          const n = name.toLowerCase();
          if (n.includes("gold")) return gold;
          if (n.includes("chrome") || n.includes("cap_ornate")) return chrome;
          if (n.includes("gunmetal")) return gunmetal;
          if (n.includes("clear")) return clearGlass;
          if (n.includes("dip")) return clearGlass;
          if (n.includes("glass") || n.includes("green") || n.includes("cobalt") || n.includes("crystal")) return bodyGlass;
          if (n.includes("label") || n.includes("print")) return label;
          if (n.includes("linen") || n.includes("drawstring") || n.includes("cord")) return linen;
          if (n.includes("wood") || n.includes("beech")) return wood;
          return dark;
        };

        const loader = new OBJLoader();
        loader.load(
          objUrl,
          (obj: Group) => {
            if (disposed) return;
            obj.traverse((child) => {
              const mesh = child as Mesh;
              if (mesh.isMesh) {
                const matName = (Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name) ?? mesh.name;
                mesh.material = pick(matName || mesh.name);
              }
            });
            // Merkezle + ölçekle
            const box = new THREE.Box3().setFromObject(obj);
            const center = box.getCenter(new THREE.Vector3());
            obj.position.sub(center);
            scene.add(obj);
            setReady(true);
          },
          undefined,
          () => {
            if (!disposed) setFailed(true);
          },
        );

        let raf = 0;
        const animate = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        animate();

        const onResize = () => {
          const w = mount.clientWidth || width;
          const h = mount.clientHeight || height;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          renderer.dispose();
          pmrem.dispose();
          if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
          else if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [objUrl, glassColor]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Poster: 3D hazır olana kadar / başarısızsa (poster verilmişse) */}
      {(!ready || failed) && poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="EMA parfüm şişesi" className="absolute inset-0 h-full w-full object-contain" />
      )}
      <div ref={mountRef} className={`h-full w-full ${ready && !failed ? "opacity-100" : "opacity-0"} transition-opacity duration-500`} aria-hidden={!ready} />
    </div>
  );
}
