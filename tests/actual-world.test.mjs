import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createWorld } from '../core/world.js';
import { BUILDING, GROUNDS, FLOORS, ENTRANCES, OBJECTIVE, SUPPORTS, GRAND_STAIR, FLOOR_HOLES, GALLERY, ELEVATOR, doorPoint } from '../core/layout.js';
import { PLAYER, moveWithCollisions, groundHeight, overlapsCollider } from '../core/controller.js';
import { createFixtureField } from '../core/fixture-lighting.js';

// Canvas pixels are irrelevant to geometry tests. This supplies only the 2D
// methods used by procedural labels/materials; actual rendering is browser QA.
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }),
};
const scene = new THREE.Scene();
const world = createWorld(scene, { audit: true });
for (const door of world.doors.values()) door.setOpen(true);
world.update(3, 0);

function advance(position, target, { maxSteps = 4000 } = {}) {
  let p = { x: position.x ?? position[0], y: position.y ?? position[1], z: position.z ?? position[2] };
  const destination = { x: target.x ?? target[0], y: target.y ?? target[1], z: target.z ?? target[2] };
  let velocity = 0;
  let stalled = 0;
  for (let i = 0; i < maxSteps; i++) {
    const dx = destination.x - p.x, dz = destination.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.035 && Math.abs(p.y - destination.y) < 0.08) return p;
    const step = Math.min(distance, PLAYER.walkSpeed / 60);
    const before = { ...p };
    p = moveWithCollisions(p, { x: distance ? dx / distance * step : 0, z: distance ? dz / distance * step : 0 }, world.colliders, { supports: world.supports });
    const ground = groundHeight(p, world.supports);
    if (ground !== null && p.y - ground <= 0.4 && velocity <= 0) { p.y = ground; velocity = 0; }
    else {
      velocity = Math.max(-20, velocity - 18 / 60);
      const nextY = p.y + velocity / 60;
      if (ground !== null && nextY <= ground) { p.y = ground; velocity = 0; }
      else if (!world.colliders.some(collider => overlapsCollider({ ...p, y: nextY }, collider))) p.y = nextY;
      else velocity = 0;
    }
    assert(Math.abs(p.y - before.y) < .12, `height jump from ${JSON.stringify(before)} to ${JSON.stringify(p)}`);
    assert(world.colliders.every(collider => !overlapsCollider(p, collider)), `collision penetration at ${JSON.stringify(p)}: ${world.colliders.filter(collider => overlapsCollider(p, collider)).map(collider => collider.id)}`);
    if (Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) < 0.00001) stalled++;
    else stalled = 0;
    if (stalled > 20) break;
  }
  const blockers = world.colliders.filter(collider => overlapsCollider({ ...p, x: p.x + Math.sign(destination.x - p.x) * .15, z: p.z + Math.sign(destination.z - p.z) * .15 }, collider)).map(collider => collider.id);
  assert.fail(`Route blocked: ${JSON.stringify(position)} → ${JSON.stringify(target)}; stopped at ${JSON.stringify(p)}; nearby ${blockers.join(', ')}`);
}

function route(points) {
  let p = points[0];
  for (const point of points.slice(1)) p = advance(p, point);
  return p;
}

test('actual world produces finite complete geometry, assigned materials, and valid collider volumes', () => {
  assert(world.colliders.length > 300);
  assert(world.stats.instances > 1000);
  scene.traverse(object => {
    assert([...object.position, ...object.scale].every(Number.isFinite), object.name);
    if (object.isMesh) {
      assert(object.material);
      assert(object.geometry.attributes.position.count > 0);
      assert(object.scale.x !== 0 && object.scale.y !== 0 && object.scale.z !== 0);
    }
  });
  for (const collider of world.colliders) for (let axis = 0; axis < 3; axis++) {
    assert(Number.isFinite(collider.min[axis]) && Number.isFinite(collider.max[axis]));
    assert(collider.max[axis] > collider.min[axis], collider.id);
  }
});

const objectiveApproach = [0, OBJECTIVE.position[1], OBJECTIVE.position[2] + 1.48];
const hallRoute = [[0, 0, 17], [6.5, 0, 17], [6.5, 0, 0]];
const vaultRoute = [[-2.7, -4.4, -2.7], [-2.7, -4.4, -8], [0, -4.4, -8], objectiveApproach];
const inWorld = (p, colliders = world.colliders) => !colliders.some(collider => overlapsCollider(p, collider));

function downStairs(side, lowerY, upperY) {
  return [
    [side * 21, upperY, 0], [side * 21, upperY, -3.15], [side * 18.6, upperY, -3.15],
    [side * 18.6, upperY, -17], [side * 22.9, upperY, -17], [side * 22.9, upperY, -16],
    [side * 22.9, lowerY, -5.4], [side * 22.9, lowerY, -4.15], [side * 21, lowerY, -3.15],
    [side * 21, lowerY, 0], [0, lowerY, 0],
  ];
}

test('all three approaches reach the vault and return through both service wings', () => {
  for (const [index, entrance] of ENTRANCES.entries()) {
    const side = index === 1 ? 1 : -1;
    const path = [entrance.spawn, ...(index === 0 ? hallRoute : []), ...downStairs(side, -4.4, 0), ...vaultRoute];
    const p = route(path);
    assert(Math.hypot(p.x - OBJECTIVE.position[0], p.z - OBJECTIVE.position[2]) < OBJECTIVE.radius);
    route(path.toReversed());
  }
});

test('grand stair reaches the gallery and both side stairs reach the upper floor', () => {
  const path = [[0, 0, 17], [0, 0, 14], [0, 4.4, 4.3], [0, 4.4, .5]];
  route(path);
  route(path.toReversed());
  for (const side of [-1, 1]) {
    route([[0, 4.4, .5], [side * 9, 4.4, .5], [side * 9, 4.4, 16.5]]);
    const wing = downStairs(side, 0, 4.4);
    route(wing);
    route(wing.toReversed());
  }
});

test('all 38 door openings clear the actual meshes in both directions', () => {
  scene.updateMatrixWorld(true);
  const meshList = [];
  scene.traverseVisible(object => { if (object.isMesh) meshList.push(object); });
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  for (const { definition: door } of world.doors.values()) {
    for (const sign of [-1, 1]) {
      const start = new THREE.Vector3(...doorPoint(door, 0, sign * .7));
      const end = new THREE.Vector3(...doorPoint(door, 0, -sign * .7));
      dir.subVectors(end, start).normalize();
      const round = door.kind === 'vault';
      const offsets = round ? [-.55, 0, .55] : [-.46, -.33, -.17, 0, .17, .33, .46].map(n => n * door.width);
      const heights = [.14, .5, 1.1, 1.65, 2.08, round ? 3.1 : door.height - .1];
      for (const across of offsets) {
        for (const height of heights) {
          const origin = new THREE.Vector3(...doorPoint(door, across, sign * .7));
          origin.y += height;
          ray.set(origin, dir);
          ray.far = 1.4;
          const [hit] = ray.intersectObjects(meshList, false);
          const part = hit?.object.userData.parts?.[hit.instanceId] ?? hit?.object.name;
          assert(!hit, `${door.id} at ${across}, ${height}, side ${sign} blocked by ${part}`);
        }
      }
    }
  }
});

test('each sliding door holds the player outside while shut and clears the full player when open', () => {
  for (const door of world.doors.values()) {
    const d = door.definition;
    if (d.kind === 'vault') continue;
    assert(door.setOpen(false));
    world.update(.5, 0);
    for (const lateral of [-.5, 0, .5]) for (const side of [-1, 1]) {
      const p = doorPoint(d, lateral, side);
      const q = doorPoint(d, lateral, -side);
      const stopped = moveWithCollisions(p, { x: q[0] - p[0], z: q[2] - p[2] }, world.colliders);
      assert(Math.hypot(stopped.x - p[0], stopped.z - p[2]) < .8, d.id);
    }
    assert(door.setOpen(true));
    world.update(.16, 0);
    assert(door.collider.enabled, d.id);
    const axis = d.axis === 'x' ? 0 : 2;
    assert(Math.abs(door.collider.max[axis] - door.collider.min[axis] - (d.width - .02) / 2) < .001, d.id);
    world.update(.16, 0);
    for (const lateral of [-.5, 0, .5]) {
      const a = doorPoint(d, lateral, -.82);
      const b = doorPoint(d, lateral, .82);
      route([a, b, a]);
    }
  }
});

test('vault spins its wheel before swinging, then clears the center of the passage', () => {
  const door = world.doors.get('B1-vault-door');
  const d = door.definition;
  const wheel = door.object.getObjectByName(`${d.id} handwheel`);
  door.reset();
  const front = doorPoint(d, 0, -1.3), back = doorPoint(d, 0, 1.4);
  const attempt = () => moveWithCollisions(front, { x: 0, z: back[2] - front[2] }, world.colliders);
  assert(attempt().z > d.position[2]);
  door.setLocked(true);
  assert.equal(door.setOpen(true), false);
  door.setLocked(false);
  assert(door.setOpen(true));
  world.update(.38, 0);
  assert.equal(door.phase, 'unlocking');
  assert(Math.abs(wheel.rotation.z) > 1);
  assert.equal(door.object.rotation.y, 0);
  assert(attempt().z > d.position[2]);
  world.update(.86, 0);
  assert.equal(door.phase, 'opening');
  assert(door.object.rotation.y > .1);
  assert(attempt().z > d.position[2]);
  world.update(2, 0);
  assert.equal(door.phase, 'open');
  assert(door.object.rotation.y > Math.PI / 2);
  assert(door.object.visible);
  route([front, back, front]);
  const player = { position: new THREE.Vector3(...doorPoint(d, 0, 0)) };
  world.player = player;
  assert.equal(door.setOpen(false), false, 'vault must stay open around a player in the threshold');
  player.position.fromArray(doorPoint(d, 0, 2.3));
  assert(door.setOpen(false));
  world.update(3, 0, player);
  assert(door.open, 'vault must reopen if the moving leaf approaches a player');
  assert(inWorld(player.position), 'the moving leaf must stop short of the player');
  world.player = null;
  world.update(3, 0);
  assert(door.setOpen(false));
  world.update(3, 0);
  assert.equal(door.phase, 'closed');
  assert(attempt().z > d.position[2]);
  door.setOpen(true);
  world.update(3, 0);
});

test('closing leaves reopen if a player steps into the aperture', () => {
  for (const id of ['L1-lobby-east-door', 'L1-lobby-west-door', 'entrance-service-door']) {
    const door = world.doors.get(id);
    const player = { position: new THREE.Vector3(...doorPoint(door.definition, 0, 1)) };
    world.player = player;
    assert(door.setOpen(false));
    player.position.fromArray(door.definition.position);
    world.update(.2, 0, player);
    assert(door.open, id);
    assert(inWorld(player.position), id);
    assert.equal(door.setOpen(false), false, id);
    world.player = null;
  }
});

test('lift locks the shaft at absent floors and opens a direct basement exit to the vault', () => {
  const passenger = { position: new THREE.Vector3(...ELEVATOR.position) };
  for (const y of [4.4, -4.4, 0]) {
    const before = world.lift.y;
    route([[0, before, -2.7], [0, before, -5.5]]);
    assert(world.lift.moveTo(y, true));
    while (world.lift.moving) {
      const lastY = passenger.position.y;
      world.update(1 / 60, 0, passenger);
      assert(Math.abs(passenger.position.y - lastY) <= .038);
      assert.equal(groundHeight(passenger.position, world.supports), world.lift.y);
      assert(inWorld(passenger.position));
      for (const gate of world.lift.gates) {
        const closed = world.lift.moving || gate.y !== world.lift.y;
        assert.equal(gate.collider.enabled, closed);
        assert.equal(gate.mesh.visible, closed);
      }
    }
    route([[0, y, -5.5], [0, y, -2.7]]);
    if (y === -4.4) {
      route([[0, y, -5.5], [0, y, -8.1], [0, y, -5.5]]);
      const vault = world.doors.get('B1-vault-door');
      vault.reset();
      scene.updateMatrixWorld(true);
      const visibleMeshes = [];
      scene.traverseVisible(object => { if (object.isMesh) visibleMeshes.push(object); });
      const eye = new THREE.Vector3(0, y + PLAYER.eyeHeight, ELEVATOR.position[2]);
      const ray = new THREE.Raycaster(eye, new THREE.Vector3(0, 0, -1), .05, 8);
      const [hit] = ray.intersectObjects(visibleMeshes, false);
      assert(hit?.object.name.startsWith('B1-vault-door'), 'the closed vault is visible from the basement elevator');
      vault.setOpen(true);
      world.update(3, 0);
    }
  }
});

test('stair guards and every edge of the playable city resist high-speed movement', () => {
  for (const [start, delta, axis, sign, boundary] of [
    [[38, 0, 0], { x: 12, z: 0 }, 'x', 1, GROUNDS.maxX],
    [[-38, 0, 0], { x: -12, z: 0 }, 'x', -1, GROUNDS.minX],
    [[0, 0, 29], { x: 0, z: 12 }, 'z', 1, GROUNDS.maxZ],
    [[0, 0, -29], { x: 0, z: -12 }, 'z', -1, GROUNDS.minZ],
  ]) {
    const moved = moveWithCollisions(start, delta, world.colliders, { supports: world.supports });
    assert(sign * moved[axis] <= sign * boundary - PLAYER.radius + .01);
  }
  for (const side of [-1, 1]) {
    for (const z of [-15.5, -10, -5.6]) {
      for (const y of [0, 4.4]) {
        const blocked = moveWithCollisions([side * 18.6, y, z], { x: side * 8, z: 0 }, world.colliders);
        assert(Math.abs(blocked.x) < 21.46, `shaft side at ${side}, ${y}, ${z}`);
      }
    }
    const top = moveWithCollisions([side * 22.9, 4.4, -4.4], { x: 0, z: -2 }, world.colliders);
    assert(top.z > -5.4);
    const gallery = moveWithCollisions([side * 9, 4.4, 11], { x: -side * 4, z: 0 }, world.colliders);
    assert(Math.abs(gallery.x) > 8);
  }
});

test('walkable slabs cover each floor continuously outside shafts and the atrium', () => {
  for (const floor of FLOORS) {
    const holes = FLOOR_HOLES.filter(hole => hole.floor === floor.id);
    for (let x = BUILDING.minX + .25; x < BUILDING.maxX; x += .5) {
      for (let z = BUILDING.minZ + .25; z < BUILDING.maxZ; z += .5) {
        const inside = rect => x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ;
        if (holes.some(hole => inside(hole) && (hole.kind !== 'atrium' || !GALLERY.some(inside)))) continue;
        assert(world.supports.some(support => support.y === floor.y && inside(support)), `${floor.id} floor hole at ${x}, ${z}`);
      }
    }
  }
});

test('city asphalt stays outside the playable block and both basement flights have open sightlines', () => {
  for (const box of world.auditBoxes.filter(box => box.name === 'city' && box.material === 'asphalt')) {
    const overlapsX = Math.min(box.max[0], GROUNDS.maxX) - Math.max(box.min[0], GROUNDS.minX);
    const overlapsZ = Math.min(box.max[2], GROUNDS.maxZ) - Math.max(box.min[2], GROUNDS.minZ);
    assert(!(overlapsX > .001 && overlapsZ > .001), 'city asphalt crosses the playable block');
  }
  scene.updateMatrixWorld(true);
  const direction = new THREE.Vector3(0, .45, -1).normalize();
  for (const ramp of SUPPORTS.filter(ramp => ramp.lowerY === FLOORS[0].y)) {
    const eye = new THREE.Vector3(ramp.x, (ramp.lowerY + ramp.upperY) / 2 + PLAYER.eyeHeight,
      (ramp.zMin + ramp.zMax) / 2);
    const ray = new THREE.Raycaster(eye, direction, .01, 1);
    assert.equal(ray.intersectObjects(scene.children).length, 0, ramp.id);
  }
});

test('stationary fixture lighting reaches through a wall opening and stops behind the wall', () => {
  const field = createFixtureField();
  try {
    field.bake([{ position: [-2, 1, 0], range: 8, strength: 12, color: '#ffffff' }],
      [{ min: [-.15, -2, -4], max: [.15, 4, .7] }]);
    const { bankFixtures, bankFixtureOrigin, bankFixtureScale } = field.uniforms;
    const { data, width, height, depth } = bankFixtures.value.image;
    const dimensions = [width, height, depth];
    const origin = bankFixtureOrigin.value.toArray(), scale = bankFixtureScale.value.toArray();
    function redAt(position) {
      const [x, y, z] = position.map((n, axis) => Math.floor((n - origin[axis]) * scale[axis] * dimensions[axis]));
      return data[((z * height + y) * width + x) * 4];
    }
    assert(redAt([-1, 1, 0]) > 80);
    assert.equal(redAt([2, 1, 0]), 0);
    assert(redAt([2, 1, 2.1]) > 20);
  } finally {
    field.dispose();
  }
});

test('the exterior shell closes the storey seams and structural volumes only meet at their edges', () => {
  for (const [index, first] of world.structure.entries()) {
    for (const second of world.structure.slice(index + 1)) {
      assert(!first.min.every((n, axis) => Math.min(first.max[axis], second.max[axis]) >
        Math.max(n, second.min[axis]) + .00001), `${first.id} overlaps ${second.id}`);
    }
  }
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const height of [4.17, 4.27, 4.37]) for (const axis of ['x', 'z']) {
    const edge = axis === 'x' ? BUILDING.maxX : BUILDING.maxZ;
    for (let across = -(axis === 'x' ? BUILDING.maxZ : BUILDING.maxX) + .25; across < -0.25 + (axis === 'x' ? BUILDING.maxZ : BUILDING.maxX); across += .5) {
      for (const sign of [-1, 1]) {
        const origin = axis === 'x' ? [sign * (edge - .35), height, across] : [across, height, sign * (edge - .35)];
        const direction = axis === 'x' ? [sign, 0, 0] : [0, 0, sign];
        ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
        ray.far = .75;
        assert(ray.intersectObjects([world.groups.get('L1'), world.groups.get('L2')]).length > 0,
          `open seam at ${origin} toward ${direction}`);
      }
    }
  }
});

test('static box geometry has no overlapping coplanar faces', () => {
  const planes = new Map();
  for (const box of world.auditBoxes) for (let axis = 0; axis < 3; axis++) for (const face of ['min', 'max']) {
    const key = `${axis}:${face}:${Math.round(box[face][axis] * 100000)}`;
    const first = (axis + 1) % 3, second = (axis + 2) % 3;
    const peers = planes.get(key) || [];
    for (const other of peers) {
      const width = Math.min(box.max[first], other.max[first]) - Math.max(box.min[first], other.min[first]);
      const depth = Math.min(box.max[second], other.max[second]) - Math.max(box.min[second], other.min[second]);
      assert(!(width > .001 && depth > .001 && width * depth > .0004),
        `${box.name} (${box.material}) shares ${key} with ${other.name} (${other.material})`);
    }
    peers.push(box);
    planes.set(key, peers);
  }
});
