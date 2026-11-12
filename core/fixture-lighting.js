import * as THREE from '../vendor/three.module.js';
import { BUILDING, FLOORS } from './layout.js';

// Bake the light from stationary fixtures into world-space irradiance. The same
// texels light the bank when viewed through a door, from the stair, or from outside.
export function createFixtureField() {
    const origin = [BUILDING.minX - 4, FLOORS[0].y - .6, BUILDING.minZ - 4];
    const span = [BUILDING.maxX + 4 - origin[0], BUILDING.height + .6 - origin[1], BUILDING.maxZ + 4 - origin[2]];
    const size = span.map(length => Math.ceil(length / .6));
    const texels = new Uint8Array(size[0] * size[1] * size[2] * 4);
    const map = new THREE.Data3DTexture(texels, ...size);
    map.name = 'Bank fixture irradiance';
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    const uniforms = {
        bankFixtures: { value: map },
        bankFixtureOrigin: { value: new THREE.Vector3(...origin) },
        bankFixtureScale: { value: new THREE.Vector3(...span.map(length => 1 / length)) },
    };

    function bake(fixtures, structure) {
        const radiance = new Float32Array(texels.length);
        const cell = span.map((length, axis) => length / size[axis]);
        const coordinates = size.map((count, axis) =>
            Array.from({ length: count }, (_, i) => origin[axis] + (i + .5) * cell[axis]));
        for (const fixture of fixtures) {
            const { position, range, strength } = fixture;
            const color = new THREE.Color(fixture.color);
            const lower = position.map((n, axis) => Math.max(0, Math.floor((n - range - origin[axis]) / cell[axis])));
            const upper = position.map((n, axis) => Math.min(size[axis] - 1, Math.floor((n + range - origin[axis]) / cell[axis])));
            const nearby = structure.filter(box => position.every((n, axis) =>
                box.max[axis] > n - range && box.min[axis] < n + range));
            for (let z = lower[2]; z <= upper[2]; z++) {
                const dz = coordinates[2][z] - position[2];
                for (let y = lower[1]; y <= upper[1]; y++) {
                    const dy = coordinates[1][y] - position[1];
                    for (let x = lower[0]; x <= upper[0]; x++) {
                        const dx = coordinates[0][x] - position[0];
                        const distanceSquared = dx * dx + dy * dy + dz * dz;
                        const rangeFactor = 1 - distanceSquared / (range * range);
                        if (rangeFactor <= 0) continue;
                        const direction = [dx, dy, dz];
                        if (nearby.some(box => intersectsSegment(box, position, direction))) continue;
                        const intensity = strength * rangeFactor * rangeFactor / (6 + distanceSquared);
                        const index = ((z * size[1] + y) * size[0] + x) * 4;
                        radiance[index] += intensity * color.r;
                        radiance[index + 1] += intensity * color.g;
                        radiance[index + 2] += intensity * color.b;
                    }
                }
            }
        }
        for (let i = 0; i < texels.length; i += 4) {
            for (let channel = 0; channel < 3; channel++) {
                texels[i + channel] = Math.round(255 * Math.min(1, radiance[i + channel]));
            }
            texels[i + 3] = 255;
        }
        map.needsUpdate = true;
    }

    return { uniforms, bake, dispose: () => map.dispose() };
}

function intersectsSegment(box, start, direction) {
    let entry = .0001;
    let exit = .9999;
    for (let axis = 0; axis < 3; axis++) {
        const distance = direction[axis];
        if (Math.abs(distance) < .00001) {
            if (start[axis] < box.min[axis] || start[axis] > box.max[axis]) return false;
            continue;
        }
        const t0 = (box.min[axis] - start[axis]) / distance;
        const t1 = (box.max[axis] - start[axis]) / distance;
        entry = Math.max(entry, Math.min(t0, t1));
        exit = Math.min(exit, Math.max(t0, t1));
        if (entry >= exit) return false;
    }
    return true;
}
