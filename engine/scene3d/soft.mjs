// Soft props: a thing that does not bend (a sofa, a cushion, a plant pot) described
// with the same blobs as a character, meshed once and kept on disk.
import * as THREE from 'three/webgpu';
import { meshShape, skinShape, cached } from './sdf.mjs';
import { paint } from './materials.mjs';

export function softMesh(ops, { h = 0.012, material = {} } = {}) {
  const data = cached({ v: 1, soft: true, ops, h }, () => {
    const m = meshShape(ops, h);
    const s = skinShape(m, new Map(), null);
    return { position: m.position, normal: m.normal, index: m.index, color: s.color };
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(data.position.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  const mesh = new THREE.Mesh(geo, material.isMaterial ? material : paint({ vertexColors: true, rest: true, ...material }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
