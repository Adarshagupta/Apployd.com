'use client';

import { useEffect, useRef } from 'react';

import * as THREE from 'three';

type SectionVariant = 'hero' | 'product' | 'features' | 'lab' | 'workflow' | 'integration' | 'cta';

const paletteByVariant: Record<SectionVariant, { line: number; point: number; ring: number }> = {
  hero: { line: 0x5a7ec7, point: 0x7fb6ff, ring: 0x3a5eb7 },
  product: { line: 0x4f74d0, point: 0x78b2ff, ring: 0x2f5ed3 },
  features: { line: 0x6481c7, point: 0x85c2ff, ring: 0x4a67c2 },
  lab: { line: 0x3a7fe0, point: 0x47a5ff, ring: 0x2f8dff },
  workflow: { line: 0x4e70ca, point: 0x75b4ff, ring: 0x4062c4 },
  integration: { line: 0x4e70ca, point: 0x72a8ff, ring: 0x3c61bf },
  cta: { line: 0x5574c3, point: 0x76a7ff, ring: 0x4866b8 },
};

interface SectionThreeBackgroundProps {
  className?: string;
  variant: SectionVariant;
}

export function SectionThreeBackground({ className = '', variant }: SectionThreeBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const palette = paletteByVariant[variant];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
    camera.position.set(0, 0.6, 10.5);

    const baseGroup = new THREE.Group();
    scene.add(baseGroup);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: palette.line,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const gridGeometry = new THREE.BufferGeometry();
    const lines: number[] = [];
    const extent = 10;
    const step = 1.25;
    for (let i = -8; i <= 8; i += 1) {
      const pos = i * step;
      lines.push(-extent, pos, 0, extent, pos, 0);
      lines.push(pos, -extent, 0, pos, extent, 0);
    }
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const grid = new THREE.LineSegments(gridGeometry, lineMaterial);
    grid.rotation.x = -0.3;
    grid.position.z = -2.4;
    baseGroup.add(grid);

    const ringGeometry = new THREE.TorusGeometry(2.7, 0.055, 12, 72);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI * 0.35;
    ring.position.set(0, -0.4, -1.2);
    baseGroup.add(ring);

    const pointsCount = 64;
    const pointsData = new Float32Array(pointsCount * 3);
    for (let i = 0; i < pointsCount; i += 1) {
      const idx = i * 3;
      pointsData[idx] = (Math.random() - 0.5) * 18;
      pointsData[idx + 1] = (Math.random() - 0.5) * 11;
      pointsData[idx + 2] = (Math.random() - 0.5) * 4;
    }
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointsData, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.06,
      color: palette.point,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    baseGroup.add(points);

    const bandGeometry = new THREE.PlaneGeometry(16, 4.4);
    const bandMaterial = new THREE.MeshBasicMaterial({
      color: palette.point,
      transparent: true,
      opacity: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const band = new THREE.Mesh(bandGeometry, bandMaterial);
    band.rotation.x = -0.22;
    band.position.set(0, -2.3, -2.6);
    baseGroup.add(band);

    let rafId = 0;
    let inView = true;
    let mounted = true;
    let scrollY = window.scrollY;
    let width = 1;
    let height = 1;
    const pointer = { x: 0, y: 0 };
    const smoothPointer = { x: 0, y: 0 };
    const clock = new THREE.Clock();
    const reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resizeRenderer = () => {
      width = Math.max(canvas.clientWidth, 1);
      height = Math.max(canvas.clientHeight, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onScroll = () => {
      scrollY = window.scrollY;
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              inView = Boolean(entry?.isIntersecting);
            },
            { threshold: 0.05 },
          )
        : null;
    observer?.observe(canvas);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            resizeRenderer();
          })
        : null;
    resizeObserver?.observe(canvas);

    const animate = () => {
      if (!mounted) {
        return;
      }

      if (!inView) {
        rafId = window.requestAnimationFrame(animate);
        return;
      }

      const time = clock.getElapsedTime();
      smoothPointer.x += (pointer.x - smoothPointer.x) * 0.08;
      smoothPointer.y += (pointer.y - smoothPointer.y) * 0.08;

      baseGroup.position.x = smoothPointer.x * 0.38;
      baseGroup.position.y = smoothPointer.y * 0.24;
      baseGroup.rotation.z = smoothPointer.x * 0.03;
      grid.position.y = -0.2 + Math.sin(time * 0.3) * 0.08 + ((scrollY * 0.00022) % 0.8);
      ring.rotation.z = time * 0.12 + smoothPointer.x * 0.2;
      points.rotation.z = -time * 0.03;
      points.rotation.y = time * 0.05;
      pointsMaterial.opacity = 0.3 + Math.sin(time * 1.1) * 0.08;

      if (!reducedMotion) {
        band.position.x = Math.sin(time * 0.4) * 0.35;
      }

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    };

    resizeRenderer();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    rafId = window.requestAnimationFrame(animate);

    return () => {
      mounted = false;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      resizeObserver?.disconnect();

      scene.traverse((object: THREE.Object3D) => {
        const disposable = object as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        if (disposable.geometry) {
          disposable.geometry.dispose();
        }
        if (disposable.material) {
          if (Array.isArray(disposable.material)) {
            for (const material of disposable.material) {
              material.dispose();
            }
          } else {
            disposable.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
