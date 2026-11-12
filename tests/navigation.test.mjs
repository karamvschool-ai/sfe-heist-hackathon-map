import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING, GROUNDS, FLOORS, ROOMS, DOORS, ENTRANCES, STAIRS, GRAND_STAIR, ELEVATOR, OBJECTIVE, SUPPORTS, FLOOR_HOLES, floorAt, roomAt, isOutside, doorPoint } from '../core/layout.js';
import { PLAYER, groundHeight, moveWithCollisions, overlapsCollider } from '../core/controller.js';

test('canonical map has three levels in a compact 52 × 38 m footprint', () => {
  assert.deepEqual(FLOORS.map(floor => floor.id), ['B1', 'L1', 'L2']);
  assert.deepEqual(FLOORS.map(floor => floor.y), [-4.4, 0, 4.4]);
  assert.equal(BUILDING.maxX - BUILDING.minX, 52);
  assert.equal(BUILDING.maxZ - BUILDING.minZ, 38);
  assert.equal(ROOMS.find(room => room.id === OBJECTIVE.vaultId)?.kind, 'vault');
  assert.equal(ROOMS.length, 34);
  assert.equal(ROOMS.filter(room => room.kind !== 'stairs').length, 28);
  assert.equal(DOORS.length, 38);
});

test('traditional bank registry exposes banking offices and a connected public grand stair', () => {
  assert.equal(FLOORS.find(floor => floor.id === 'L2').name, 'Private banking & offices');
  assert(ROOMS.filter(room => room.floor === 'L2').every(room => !['lab', 'prototype', 'testing', 'observation'].includes(room.kind)));
  assert.equal(ROOMS.find(room => room.id === 'L2-lab-a').name, 'Private banking office');
  assert(SUPPORTS.includes(GRAND_STAIR));
  assert.deepEqual(GRAND_STAIR.floorConnections, ['L1', 'L2']);
  assert.equal(GRAND_STAIR.z0, GRAND_STAIR.zMax);
  assert.equal(GRAND_STAIR.z1, GRAND_STAIR.zMin);
  assert.equal(GRAND_STAIR.y1 - GRAND_STAIR.y0, 4.4);
  assert.deepEqual(DOORS.find(door => door.id === 'L1-lobby-west-door').position, [-6.5, 0, 1.8]);
  assert.deepEqual(DOORS.find(door => door.id === 'L1-lobby-east-door').position, [6.5, 0, 1.8]);
});

test('room bounds, IDs, world positions, and metadata are internally consistent', () => {
  assert.equal(new Set(ROOMS.map(room => room.id)).size, ROOMS.length);
  assert.equal(new Set(DOORS.map(door => door.id)).size, DOORS.length);
  for (const room of ROOMS) {
    assert(room.name && room.zone && room.kind, room.id);
    assert.equal(floorAt(room.center[1]).id, room.floor);
    assert.equal(roomAt(room.center)?.id, room.id);
    for (let axis = 0; axis < 3; axis++) {
      assert(Number.isFinite(room.center[axis]));
      assert(room.bounds.max[axis] > room.bounds.min[axis]);
      assert(room.center[axis] >= room.bounds.min[axis]);
      assert(room.center[axis] <= room.bounds.max[axis]);
    }
    assert(room.doors.length > 0, `${room.id} has an entrance`);
  }
});

test('every room entrance lies on its boundary and faces a connected corridor', () => {
  for (const room of ROOMS) {
    for (const id of room.doors) {
      const door = DOORS.find(candidate => candidate.id === id);
      assert(door, id);
      assert.equal(door.roomId, room.id);
      assert.equal(door.floor, room.floor);
      assert.equal(door.position[1], room.bounds.min[1]);
      const along = door.axis === 'x' ? 0 : 2;
      const normal = along === 0 ? 2 : 0;
      assert(door.position[along] - door.width / 2 >= room.bounds.min[along], id);
      assert(door.position[along] + door.width / 2 <= room.bounds.max[along], id);
      assert.equal(door.position[normal], (door.inward > 0 ? room.bounds.min : room.bounds.max)[normal], id);
      assert.equal(roomAt(doorPoint(door, 0, .3))?.id, room.id, id);
      assert(door.width > PLAYER.radius * 2);
      assert(door.height > PLAYER.height);
      assert(door.connects.includes(room.id));
      assert(door.connects.some(connection => connection !== room.id), id);
    }
  }
});

test('three distinct exterior approaches have valid surface spawns', () => {
  assert.equal(ENTRANCES.length, 3);
  assert.equal(new Set(ENTRANCES.map(entrance => entrance.id)).size, 3);
  assert.equal(new Set(ENTRANCES.map(entrance => entrance.position.join(','))).size, 3);
  for (const entrance of ENTRANCES) {
    assert.equal(entrance.floor, 'L1');
    assert.equal(entrance.spawn[1], 0);
    assert(entrance.width > PLAYER.radius * 2);
    assert(entrance.connects.includes('exterior'));
    assert(entrance.spawn.every(Number.isFinite));
    assert(Number.isFinite(entrance.yaw));
    assert(isOutside(entrance.spawn));
    assert(Math.abs(entrance.spawn[0]) < GROUNDS.maxX && Math.abs(entrance.spawn[2]) < GROUNDS.maxZ);
  }
});

test('door/stair/lift registry connects every room to each exterior approach', () => {
  const graph = new Map();
  const link = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b); graph.get(b).add(a);
  };
  for (const door of DOORS) link(...door.connects);
  for (const entrance of ENTRANCES) link(...entrance.connects);
  for (const stairs of STAIRS) {
    assert.equal(stairs.roomIds.length, 3);
    for (let i = 1; i < stairs.roomIds.length; i++) link(stairs.roomIds[i - 1], stairs.roomIds[i]);
  }
  link(...GRAND_STAIR.roomIds);
  assert.deepEqual(ELEVATOR.stops.map(stop => stop.floor), FLOORS.map(floor => floor.id));
  for (let i = 1; i < ELEVATOR.stops.length; i++) link(`${ELEVATOR.stops[i - 1].floor}-circulation`, `${ELEVATOR.stops[i].floor}-circulation`);
  const reached = new Set(['exterior']);
  const queue = ['exterior'];
  for (const node of queue) for (const neighbor of graph.get(node) ?? []) if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  for (const room of ROOMS) assert(reached.has(room.id), `${room.id} is connected`);
  assert(reached.has(OBJECTIVE.vaultId));
});

test('high-speed movement cannot tunnel through a wall and can slide alongside it', () => {
  const wall = { id: 'wall', min: [1, -1, -20], max: [1.3, 5, 20] };
  const moved = moveWithCollisions({ x: 0, y: 0, z: 0 }, { x: 20, z: 4 }, [wall]);
  assert(moved.x < 1 - PLAYER.radius + 0.01);
  assert(Math.abs(moved.z - 4) < 0.001);
  assert(!overlapsCollider(moved, wall));
});

test('closed doors block, disabled/open doors allow passage, large furniture blocks', () => {
  const door = { id: 'door', min: [-1.2, 0, -0.12], max: [1.2, 3, 0.12], enabled: true };
  const start = { x: 0, y: 0, z: 2 };
  const closed = moveWithCollisions(start, { x: 0, z: -4 }, [door]);
  assert(closed.z >= 0.12 + PLAYER.radius - 0.01);
  door.enabled = false;
  const open = moveWithCollisions(start, { x: 0, z: -4 }, [door]);
  assert(Math.abs(open.z + 2) < 0.001);
  const cabinet = { id: 'cabinet', min: [-1, 0, -1], max: [1, 2, 1] };
  const blocked = moveWithCollisions({ x: 0, y: 0, z: 4 }, { x: 0, z: -8 }, [cabinet]);
  assert(blocked.z >= 1 + PLAYER.radius - 0.01);
});

test('diagonal input cannot penetrate the inside corner of two walls', () => {
  const walls = [
    { min: [1, 0, -5], max: [1.4, 5, 5] },
    { min: [-5, 0, 1], max: [5, 5, 1.4] },
  ];
  let p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 100; i++) {
    p = moveWithCollisions(p, { x: 0.15, z: 0.15 }, walls);
    assert(walls.every(wall => !overlapsCollider(p, wall)));
  }
  assert(p.x < 0.7 && p.z < 0.7);
});

test('colliders respect player height and do not block the same coordinates on another floor', () => {
  const wall = { min: [-1, 0, -1], max: [1, 5.6, 1] };
  assert(overlapsCollider({ x: 0, y: 0, z: 0 }, wall));
  assert(!overlapsCollider({ x: 0, y: 6, z: 0 }, wall));
  assert(!overlapsCollider({ x: 0, y: -6, z: 0 }, wall));
});

test('ground selection supports floors without snapping through a ceiling or across a hole', () => {
  const supports = FLOORS.map(floor => ({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, y: floor.y }));
  assert.equal(groundHeight({ x: 0, y: -4.4, z: 0 }, supports), -4.4);
  assert.equal(groundHeight({ x: 0, y: 0, z: 0 }, supports), 0);
  assert.equal(groundHeight({ x: 0, y: 4.4, z: 0 }, supports), 4.4);
  assert.equal(groundHeight({ x: 3, y: 0, z: 0 }, supports), null);
});

test('each stair flight supports continuous ascent and descent at standardized movement speed', () => {
  for (const ramp of SUPPORTS) {
    let p = { x: ramp.x, y: ramp.lowerY, z: ramp.zMax };
    while (p.z > ramp.zMin + .00001) {
      p = moveWithCollisions(p, { x: 0, z: -Math.min(.1, p.z - ramp.zMin) }, [], { supports: SUPPORTS });
      assert(p.y >= ramp.lowerY - 0.001 && p.y <= ramp.upperY + 0.001);
    }
    assert(Math.abs(p.y - ramp.upperY) < 0.001, `${ramp.id} ascends to the landing`);
    while (p.z < ramp.zMax - .00001) {
      p = moveWithCollisions(p, { x: 0, z: Math.min(.1, ramp.zMax - p.z) }, [], { supports: SUPPORTS });
      const ground = groundHeight(p, SUPPORTS);
      assert(ground !== null);
      assert(p.y - ground < 0.1, 'descending slope remains within ground sticking tolerance');
      p.y = ground;
    }
    assert(Math.abs(p.y - ramp.lowerY) < 0.001, `${ramp.id} descends to the landing`);
  }
});

test('every upper stair slab has a shaft opening and objective is physically inside the vault', () => {
  for (const ramp of SUPPORTS) {
    const floor = FLOORS.find(candidate => candidate.y === ramp.upperY);
    assert(FLOOR_HOLES.some(hole => hole.floor === floor.id && ['stairs', 'atrium'].includes(hole.kind) && hole.minX <= ramp.minX && hole.maxX >= ramp.maxX && hole.minZ <= ramp.minZ && hole.maxZ >= ramp.maxZ));
  }
  const vault = ROOMS.find(room => room.id === OBJECTIVE.vaultId);
  assert.equal(roomAt(OBJECTIVE.position)?.id, vault.id);
  for (let axis = 0; axis < 3; axis++) {
    assert(OBJECTIVE.bounds.min[axis] >= vault.bounds.min[axis]);
    assert(OBJECTIVE.bounds.max[axis] <= vault.bounds.max[axis]);
  }
});

test('bank walls, openings, flights, and major landmarks mirror across the centerline', () => {
  for (const room of ROOMS) {
    const { min, max } = room.bounds;
    assert(ROOMS.some(other => other.floor === room.floor && other.bounds.min[0] === -max[0] &&
      other.bounds.max[0] === -min[0] && other.bounds.min[2] === min[2] && other.bounds.max[2] === max[2]), room.id);
  }
  for (const door of DOORS) {
    const [x, y, z] = door.position;
    assert(DOORS.some(other => other.position[0] === -x && other.position[1] === y && other.position[2] === z &&
      other.axis === door.axis && other.width === door.width && other.height === door.height &&
      other.inward === door.inward * (door.axis === 'x' ? 1 : -1)), door.id);
  }
  assert.equal(STAIRS[0].x, -STAIRS[1].x);
  assert.equal(STAIRS[0].zMin, STAIRS[1].zMin);
  assert.equal(STAIRS[0].zMax, STAIRS[1].zMax);
  assert.equal(GRAND_STAIR.x, 0);
  assert.equal(ELEVATOR.position[0], 0);
  assert.equal(OBJECTIVE.position[0], 0);
});
