import * as THREE from "three";
import type { GraphData } from "../api/types";
import { getCategoryColor } from "./colors";

export function initThreeGraph(container: HTMLElement, data: GraphData): () => void {
  container.replaceChildren();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d1117");
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.z = Math.max(12, Math.sqrt(data.nodes.length) * 2.4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const group = new THREE.Group();
  const positions = new Map<string, THREE.Vector3>();
  data.nodes.forEach((node, index) => {
    const angle = (index / Math.max(data.nodes.length, 1)) * Math.PI * 2;
    const radius = 2.5 + (index % 4) * 1.2;
    positions.set(node.id, new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, ((index % 5) - 2) * 0.7));
    const material = new THREE.MeshBasicMaterial({ color: getCategoryColor(node.category) });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.node_type === "source" ? 0.24 : 0.14, 12, 8), material);
    mesh.position.copy(positions.get(node.id)!);
    group.add(mesh);
  });

  const lineMaterial = new THREE.LineBasicMaterial({ color: "#334155", transparent: true, opacity: 0.75 });
  for (const edge of data.edges) {
    const source = positions.get(edge.source); const target = positions.get(edge.target);
    if (!source || !target) continue;
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([source, target]), lineMaterial));
  }
  scene.add(group);
  let frame = 0;
  const resize = () => { const rect = container.getBoundingClientRect(); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); };
  const animate = () => { group.rotation.y += 0.0018; renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize(); animate();
  return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.dispose(); container.replaceChildren(); };
}
