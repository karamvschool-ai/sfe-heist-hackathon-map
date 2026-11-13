/** Canonical bank plan. Units are metres, +Y is up, +X east, and +Z south. */
export const MAP_VERSION = 'heist-foundry-2.1.1';
export const STOREY_HEIGHT = 4.4;
export const FLOORS = [
    { id: 'B1', label: 'B1', name: 'Infrastructure & vault', y: -4.4, color: '#d5a968' },
    { id: 'L1', label: 'L1', name: 'Banking & operations', y: 0, color: '#b69359' },
    { id: 'L2', label: 'L2', name: 'Private banking & offices', y: 4.4, color: '#996762' },
];
export const BUILDING = { minX: -26, maxX: 26, minZ: -19, maxZ: 19, height: 8.8 };
export const GROUNDS = { minX: -40, maxX: 40, minZ: -31, maxZ: 31 };
export const HALL = { minX: -10, maxX: 10, minZ: 1.8, maxZ: 19 };
export const GALLERY = [
    { minX: -10, maxX: 10, minZ: 1.8, maxZ: 4.3 },
    { minX: -10, maxX: -8, minZ: 4.3, maxZ: 19 },
    { minX: 8, maxX: 10, minZ: 4.3, maxZ: 19 },
];
export const ELEVATOR_CALL = [1.72, -3.84];
export const VAULT_APPROACH = { minX: -7.3, maxX: 7.3, minZ: -11.55, maxZ: -6.9 };
export const ELEVATOR = {
    id: 'elevator-central', name: 'Central elevator', position: [0, 0, -5.5],
    bounds: { min: [-1.42, -4.4, -6.9], max: [1.42, 8.8, -4.1] },
    stops: FLOORS.map(floor => ({
        floor: floor.id, y: floor.y, lobby: [0, floor.y, -2.7],
        ...(floor.id === 'B1' ? { rearLobby: [0, floor.y, -7.6] } : {}),
    })),
};

export const ENTRANCES = [
    {
        id: 'entrance-public', doorId: 'L1-lobby-entry', name: 'Main public entrance', floor: 'L1',
        position: [0, 0, 19], spawn: [0, 0, 25], yaw: 0, axis: 'x', width: 4.4, height: 3.2,
        inward: -1, connects: ['exterior', 'L1-lobby'],
    },
    {
        id: 'entrance-service', doorId: 'entrance-service-door', name: 'East service entrance', floor: 'L1',
        position: [26, 0, 0], spawn: [31, 0, 0], yaw: Math.PI / 2, axis: 'z', width: 3.2, height: 2.9,
        inward: -1, connects: ['exterior', 'L1-circulation'],
    },
    {
        id: 'entrance-staff', doorId: 'entrance-staff-door', name: 'West staff entrance', floor: 'L1',
        position: [-26, 0, 0], spawn: [-31, 0, 0], yaw: -Math.PI / 2, axis: 'z', width: 3.2, height: 2.9,
        inward: 1, connects: ['exterior', 'L1-circulation'],
    },
];

export const ROOMS = [];
export const DOORS = [];
const centre = (a, b) => (a + b) / 2;

function addRoom(floor, [suffix, name, kind], rect, zone, side, row) {
    const { minX, maxX, minZ, maxZ } = rect;
    const room = {
        id: `${floor.id}-${suffix}`, name, kind, floor: floor.id, zone, side,
        col: side === 'west' ? 0 : side === 'east' ? 2 : 1, row,
        center: [centre(minX, maxX), floor.y, centre(minZ, maxZ)],
        bounds: {
            min: [minX, floor.y, minZ],
            max: [maxX, floor.y + (kind === 'lobby' ? BUILDING.height : STOREY_HEIGHT), maxZ],
        },
        doors: [], connections: [],
    };
    ROOMS.push(room);
    return room;
}

function addDoor(room, { id = `${room.id}-door`, x, z, axis, inward, width = 2.05, height = 2.65,
    kind = room.kind === 'vault' ? 'vault' : 'standard', connects = `${room.floor}-circulation` }) {
    DOORS.push({
        id, roomId: room.id, floor: room.floor, position: [x, room.center[1], z],
        axis, inward, width, height, kind, connects: [room.id, connects],
    });
    room.doors.push(id);
    if (!room.connections.includes(connects)) room.connections.push(connects);
}

const programs = {
    B1: {
        north: [[['records', 'Secure records archive', 'archive'], ['reserve', 'Reserve storage', 'storage']],
            [['antechamber', 'Vault antechamber', 'lounge'], ['guard-station', 'Vault administration office', 'office']]],
        south: [[['servers', 'Server room', 'server'], ['hvac', 'Mechanical room', 'mechanical']],
            [['inventory', 'Inventory stores', 'storage'], ['loading-annex', 'Receiving annex', 'storage']]],
    },
    L1: {
        north: [[['admin-records', 'Administrative records', 'archive'], ['administration', 'Administration office', 'office']],
            [['office-a', 'Member services', 'office'], ['security-ops', 'Operations office', 'office']]],
        south: [[['registration', 'Visitor registration', 'reception'], ['tellers', 'Private teller services', 'reception']],
            [['waiting', 'West waiting lounge', 'lounge'], ['waiting-east', 'East waiting lounge', 'lounge']]],
    },
    L2: {
        north: [[['lab-a', 'Private banking office', 'office'], ['lab-c', 'Investment advisory office', 'office']],
            [['conference-a', 'Board conference room', 'conference'], ['conference-b', 'Client meeting room', 'conference']]],
        south: [[['executive', 'Executive office suite', 'executive'], ['quiet-office', 'Legal and compliance office', 'office']],
            [['documentation', 'Banking records library', 'archive'], ['break', 'Employee lounge', 'break']]],
    },
};
const sides = [{ name: 'west', sign: -1 }, { name: 'east', sign: 1 }];

for (const floor of FLOORS) {
    const programsForFloor = programs[floor.id];
    const spineEdge = floor.id === 'B1' ? VAULT_APPROACH.maxX : 3.4;
    for (const [sideIndex, { name, sign }] of sides.entries()) {
        const bounds = (inner, outer, minZ, maxZ) => ({
            minX: sign < 0 ? -outer : inner,
            maxX: sign < 0 ? -inner : outer,
            minZ, maxZ,
        });
        const stair = addRoom(floor, [`stair-${name}`, `${name === 'west' ? 'West' : 'East'} stair hall`, 'stairs'],
            bounds(16, 26, -19, -1.8), 'circulation', name, 0);
        addDoor(stair, { x: sign * 21, z: -1.8, axis: 'x', inward: -1 });

        for (const [row, [minZ, maxZ]] of [[-19, -9.4], [-9.4, -1.8]].entries()) {
            const room = addRoom(floor, programsForFloor.north[row][sideIndex],
                bounds(spineEdge, 16, minZ, maxZ), floor.id === 'B1' ? 'vault' : 'operations', name, row);
            // The B1 vault occupies the rear spine. Its flanking rooms are
            // entered through the adjacent antechamber and administration room.
            if (floor.id === 'B1' && row === 0) {
                addDoor(room, { x: sign * 11, z: -9.4, axis: 'x', inward: -1,
                    connects: `${floor.id}-${programsForFloor.north[1][sideIndex][0]}` });
            } else {
                addDoor(room, { x: sign * spineEdge, z: centre(minZ, maxZ), axis: 'z', inward: sign });
            }
        }
        for (const [row, [minZ, maxZ]] of [[1.8, 10.4], [10.4, 19]].entries()) {
            const room = addRoom(floor, programsForFloor.south[row][sideIndex], bounds(13, 26, minZ, maxZ),
                floor.id === 'B1' ? 'infrastructure' : floor.id === 'L1' ? 'public' : 'private-banking', name, row + 2);
            addDoor(room, { x: sign * 13, z: centre(minZ, maxZ), axis: 'z', inward: sign });
        }
        if (floor.id === 'B1') {
            const room = addRoom(floor, [`archive-${name}`, `${name === 'west' ? 'West' : 'East'} archive`, 'archive'],
                bounds(1.8, 10, 1.8, 19), 'infrastructure', name, 2);
            addDoor(room, { x: sign * 5.9, z: 1.8, axis: 'x', inward: 1 });
        }
    }
    if (floor.id === 'B1') {
        const vault = addRoom(floor, ['vault', 'Central vault', 'vault'],
            { minX: VAULT_APPROACH.minX, maxX: VAULT_APPROACH.maxX, minZ: -19, maxZ: VAULT_APPROACH.minZ }, 'vault', 'centre', 0);
        addDoor(vault, { x: 0, z: VAULT_APPROACH.minZ, axis: 'x', inward: -1, width: 4.05, height: 3.95 });
    }
    if (floor.id === 'L1') {
        const hall = addRoom(floor, ['lobby', 'Grand banking hall', 'lobby'], HALL, 'public', 'centre', 3);
        const main = ENTRANCES[0];
        addDoor(hall, { id: main.doorId, x: 0, z: HALL.maxZ, axis: main.axis,
            inward: main.inward, width: main.width, height: main.height, kind: 'entrance', connects: 'exterior' });
        for (const { name, sign } of sides) {
            addDoor(hall, { id: `L1-lobby-${name}-door`, x: sign * 6.5, z: HALL.minZ,
                axis: 'x', inward: 1, width: 2.25, height: 2.75 });
        }
    }
}

for (const entrance of ENTRANCES.slice(1)) {
    const { doorId, position, floor, axis, inward, width, height, connects } = entrance;
    DOORS.push({ id: doorId, roomId: null, position, floor, axis, inward, width, height, kind: 'entrance', connects });
}

/** Offset in a door's frame. Positive forward offsets point into the associated room or bank. */
export function doorPoint(door, lateral = 0, forward = 0) {
    const [x, y, z] = door.position;
    return door.axis === 'x'
        ? [x + lateral, y, z + door.inward * forward]
        : [x + door.inward * forward, y, z + lateral];
}

const flights = FLOORS.slice(0, -1).map((floor, index) => ({ lowerY: floor.y, upperY: FLOORS[index + 1].y }));
export const STAIRS = sides.map(({ name, sign }) => ({
    id: `stairs-${name}`, name: `${name === 'west' ? 'West' : 'East'} stairs`,
    x: sign * 22.9, zMin: -16, zMax: -5.4, width: 2.5,
    roomIds: FLOORS.map(floor => `${floor.id}-stair-${name}`), flights,
    bounds: {
        min: [sign < 0 ? -26 : 16, FLOORS[0].y, -19],
        max: [sign < 0 ? -16 : 26, BUILDING.height, -1.8],
    },
}));

function slope(id, x, width, zMin, zMax, lowerY, upperY) {
    return {
        id, x, width, zMin, zMax, lowerY, upperY,
        minX: x - width / 2, maxX: x + width / 2, minZ: zMin, maxZ: zMax,
        z0: zMax, z1: zMin, y0: lowerY, y1: upperY,
    };
}

export const GRAND_STAIR = {
    ...slope('stairs-grand', 0, 3.2, 4.3, 14, 0, 4.4), name: 'Grand banking hall stair',
    floorConnections: ['L1', 'L2'], roomIds: ['L1-lobby', 'L2-circulation'],
    bounds: { min: [-1.6, 0, 4.3], max: [1.6, 4.4, 14] },
};
export const SUPPORTS = [
    ...STAIRS.flatMap(stair => stair.flights.map((flight, index) => slope(`${stair.id}-ramp-${index}`,
        stair.x, stair.width, stair.zMin, stair.zMax, flight.lowerY, flight.upperY))),
    GRAND_STAIR,
];
export const FLOOR_HOLES = FLOORS.flatMap(floor => [
    ...(floor.id === 'B1' ? [] : STAIRS.map(stair => ({
        floor: floor.id, minX: stair.x - stair.width / 2, maxX: stair.x + stair.width / 2,
        minZ: stair.zMin, maxZ: stair.zMax, kind: 'stairs',
    }))),
    ...(floor.id === 'L2' ? [{ floor: 'L2', ...HALL, kind: 'atrium' }] : []),
    { floor: floor.id, minX: ELEVATOR.bounds.min[0], maxX: ELEVATOR.bounds.max[0],
        minZ: ELEVATOR.bounds.min[2], maxZ: ELEVATOR.bounds.max[2], kind: 'elevator' },
]);
export const OBJECTIVE = {
    id: 'vault-objective', vaultId: 'B1-vault', assetId: 'asset-foundry-core',
    position: [0, -4.4, -16.55], radius: 1.6,
    bounds: { min: [-1.6, -4.4, -18.15], max: [1.6, -2.4, -14.95] },
};

export function floorAt(y) {
    return y < -STOREY_HEIGHT / 2 ? FLOORS[0] : y < STOREY_HEIGHT / 2 ? FLOORS[1] : FLOORS[2];
}
export function isOutside(position) {
    const x = position.x ?? position[0];
    const z = position.z ?? position[2];
    return x < BUILDING.minX || x > BUILDING.maxX || z < BUILDING.minZ || z > BUILDING.maxZ;
}
export function roomAt(position) {
    const x = position.x ?? position[0];
    const y = position.y ?? position[1];
    const z = position.z ?? position[2];
    const floor = floorAt(y).id;
    return ROOMS.find(room => room.floor === floor && x >= room.bounds.min[0] && x <= room.bounds.max[0]
        && z >= room.bounds.min[2] && z <= room.bounds.max[2]) ?? null;
}
export const MOUNTS = ROOMS.flatMap(room => {
    const [x, y, z] = room.center;
    return [
        { id: `${room.id}-ceiling`, roomId: room.id, surface: 'ceiling',
            position: [x, room.bounds.max[1] - .27, z], normal: [0, -1, 0] },
        { id: `${room.id}-wall`, roomId: room.id, surface: 'wall',
            position: [room.bounds.min[0] + .25, y + 2.25, z], normal: [1, 0, 0] },
        { id: `${room.id}-floor`, roomId: room.id, surface: 'floor',
            position: [x, y + .03, z], normal: [0, 1, 0] },
    ];
});
