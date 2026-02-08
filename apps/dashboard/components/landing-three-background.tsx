'use client';

import { useEffect, useRef } from 'react';

import * as THREE from 'three';

function createGlowTexture(): THREE.CanvasTexture {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext('2d');
  if (!context) {
    return new THREE.CanvasTexture(textureCanvas);
  }

  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(110, 180, 255, 0.95)');
  gradient.addColorStop(0.2, 'rgba(80, 150, 255, 0.75)');
  gradient.addColorStop(1, 'rgba(10, 20, 40, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function LandingThreeBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x020308, 16, 72);

    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 230);
    camera.position.set(0, 8.2, 20);

    const world = new THREE.Group();
    world.rotation.x = -0.95;
    world.position.z = -5.5;
    scene.add(world);

    const dynamicLines: Array<{
      geometry: THREE.BufferGeometry;
      positions: Float32Array;
      base: Float32Array;
      axis: 'x' | 'z';
      offset: number;
    }> = [];

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x3d5a92,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lineMaterialStrong = new THREE.LineBasicMaterial({
      color: 0x567fc8,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const size = 42;
    const spacing = 1.8;
    const segmentCount = 64;
    const lineCount = 18;

    for (let i = -lineCount; i <= lineCount; i += 1) {
      const z = i * spacing;
      const points: number[] = [];
      for (let j = 0; j <= segmentCount; j += 1) {
        const x = -size + (j / segmentCount) * size * 2;
        points.push(x, 0, z);
      }

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(points);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const isMajor = i % 4 === 0;
      const line = new THREE.Line(geometry, isMajor ? lineMaterialStrong : lineMaterial);
      world.add(line);

      dynamicLines.push({
        geometry,
        positions,
        base: new Float32Array(positions),
        axis: 'x',
        offset: i * 0.24,
      });
    }

    for (let i = -lineCount; i <= lineCount; i += 1) {
      const x = i * spacing;
      const points: number[] = [];
      for (let j = 0; j <= segmentCount; j += 1) {
        const z = -size + (j / segmentCount) * size * 2;
        points.push(x, 0, z);
      }

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(points);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const isMajor = i % 4 === 0;
      const line = new THREE.Line(geometry, isMajor ? lineMaterialStrong : lineMaterial);
      world.add(line);

      dynamicLines.push({
        geometry,
        positions,
        base: new Float32Array(positions),
        axis: 'z',
        offset: i * 0.24,
      });
    }

    const axisMaterial = new THREE.LineBasicMaterial({
      color: 0x6478a8,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const axisGroup = new THREE.Group();
    for (let i = -4; i <= 4; i += 1) {
      const x = i * 7;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -4.4, -30),
        new THREE.Vector3(x, 8.6, -30),
      ]);
      axisGroup.add(new THREE.Line(geometry, axisMaterial));
    }
    scene.add(axisGroup);

    const particleCount = 130;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const index = i * 3;
      particlePositions[index] = (Math.random() - 0.5) * 140;
      particlePositions[index + 1] = Math.random() * 26 - 6;
      particlePositions[index + 2] = (Math.random() - 0.5) * 140;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.14,
      color: 0x94b6ff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.position.y = 1.8;
    scene.add(particles);

    const nodeCount = 220;
    const nodePositions = new Float32Array(nodeCount * 3);
    for (let i = 0; i < nodeCount; i += 1) {
      const index = i * 3;
      nodePositions[index] = (Math.random() - 0.5) * 95;
      nodePositions[index + 1] = Math.random() * 0.25;
      nodePositions[index + 2] = (Math.random() - 0.5) * 95;
    }
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    const nodeMaterial = new THREE.PointsMaterial({
      size: 0.05,
      color: 0x5fa0ff,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
    nodes.position.y = 0.07;
    world.add(nodes);

    const glowTexture = createGlowTexture();
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x4d8cff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glows: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i += 1) {
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(22 + i * 4, 12 + i * 4, 1);
      glow.position.set(-18 + i * 18, 2.2 - i * 0.55, -14 - i * 3.3);
      scene.add(glow);
      glows.push(glow);
    }

    const beamGroup = new THREE.Group();
    const beamMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const beamGeometry = new THREE.PlaneGeometry(26, 7.2);
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x2f8dff,
        transparent: true,
        opacity: 0.03 + i * 0.01,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.set(-20 + i * 16, -1 + i * 0.55, -17 - i * 3.1);
      beam.rotation.x = -0.22;
      beam.rotation.y = 0.35;
      beamGroup.add(beam);
      beamMeshes.push(beam);
    }
    scene.add(beamGroup);

    const clock = new THREE.Clock();
    const mouse = { x: 0, y: 0 };
    const smoothMouse = { x: 0, y: 0 };
    let scrollY = 0;
    let frameId = 0;
    let mounted = true;
    const root = document.documentElement;
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerMove = (event: PointerEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const onScroll = () => {
      scrollY = window.scrollY;
      root.style.setProperty('--landing-scroll', scrollY.toFixed(2));
      root.style.setProperty('--landing-scroll-soft', (scrollY * 0.45).toFixed(2));
    };

    const animate = () => {
      if (!mounted) {
        return;
      }

      const elapsed = clock.getElapsedTime();
      smoothMouse.x += (mouse.x - smoothMouse.x) * 0.05;
      smoothMouse.y += (mouse.y - smoothMouse.y) * 0.05;

      world.position.x = smoothMouse.x * 2.2;
      world.position.y = -1 + smoothMouse.y * 0.75;
      world.rotation.z = smoothMouse.x * 0.06;
      world.rotation.x = -0.95 + smoothMouse.y * 0.04 + Math.sin(elapsed * 0.28) * 0.01;

      axisGroup.position.x = smoothMouse.x * 1.3;
      axisGroup.position.y = smoothMouse.y * 0.25;
      axisGroup.position.z = scrollY * 0.0018;

      particles.rotation.y = elapsed * 0.018 + smoothMouse.x * 0.06;
      particles.rotation.x = smoothMouse.y * 0.02;
      particles.position.z = -scrollY * 0.0012;
      particles.position.x = smoothMouse.x * 1.2;

      nodes.rotation.y = elapsed * 0.016;
      nodes.material.opacity = 0.34 + Math.sin(elapsed * 1.4) * 0.09;

      camera.position.x = smoothMouse.x * 1;
      camera.position.y = 8.2 + Math.sin(elapsed * 0.25) * 0.2 + Math.min(scrollY * 0.0008, 1.2);
      camera.lookAt(world.position.x * 0.35, -0.5, -9 + scrollY * 0.001);

      for (let i = 0; i < glows.length; i += 1) {
        const glow = glows[i];
        if (!glow) {
          continue;
        }
        glow.position.x = -18 + i * 18 + Math.sin(elapsed * 0.6 + i) * 0.9 + smoothMouse.x * 0.7;
        glow.position.y = 2.2 - i * 0.55 + Math.cos(elapsed * 0.4 + i) * 0.2;
        glow.material.opacity = 0.09 + Math.sin(elapsed * 0.9 + i) * 0.03;
      }

      for (let i = 0; i < beamMeshes.length; i += 1) {
        const beam = beamMeshes[i];
        if (!beam) {
          continue;
        }
        beam.position.x = -20 + i * 16 + Math.sin(elapsed * 0.45 + i * 0.7) * 1.8 + smoothMouse.x * 1.1;
      }

      if (!prefersReducedMotion) {
        for (const line of dynamicLines) {
          const { positions, base, axis, offset, geometry } = line;
          for (let i = 0; i < positions.length; i += 3) {
            const baseX = base[i] ?? 0;
            const baseZ = base[i + 2] ?? 0;
            const primary = axis === 'x' ? baseX : baseZ;
            const secondary = axis === 'x' ? baseZ : baseX;
            positions[i + 1] =
              Math.sin(primary * 0.14 + elapsed * 0.8 + offset) * 0.12 +
              Math.cos(secondary * 0.1 + elapsed * 0.5 + offset) * 0.06;
          }
          const positionAttribute = geometry.getAttribute('position');
          if (positionAttribute) {
            positionAttribute.needsUpdate = true;
          }
        }
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    setSize();
    onScroll();
    window.addEventListener('resize', setSize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      mounted = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', setSize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--landing-scroll');
      root.style.removeProperty('--landing-scroll-soft');

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
      glowTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
