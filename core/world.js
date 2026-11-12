import * as THREE from '../vendor/three.module.js';
import { BUILDING, GROUNDS, HALL, GALLERY, FLOORS, ROOMS, DOORS, GRAND_STAIR, SUPPORTS, FLOOR_HOLES, ELEVATOR, ELEVATOR_CALL, VAULT_APPROACH, OBJECTIVE, doorPoint } from './layout.js';
import { PLAYER, overlapsCollider } from './controller.js';
import { decorateBankExterior, buildCity } from './city.js';
import { furnishBankRoom, decorateBankHall } from './bank-interior.js';
import { createMaterials } from './materials.js';
import { createFixtureField } from './fixture-lighting.js';
import { createVaultDoor } from './vault-door.js';
// Architectural geometry is shared; repeated furnishings are batched by material and floor.
export function createWorld(scene, { audit = false } = {}) {
    const colliders = [], supports = [], doors = new Map(), groups = new Map();
    const structure = [], batches = [];
    const root = new THREE.Group();
    root.name = 'Foundry National Bank';
    scene.add(root);
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 20);
    const fixtures = [];
    const fixtureField = createFixtureField();
    const materials = createMaterials(fixtureField.uniforms);
    function fixture(x, y, z, { range = 7.5, strength = 12, color = '#ffd7a0' } = {}) {
        fixtures.push({ position: [x, y, z], range, strength, color });
    }
    function addCollider(id, x, y, z, w, h, d) {
        const collider = {
            id, min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2], enabled: true
        };
        colliders.push(collider);
        return collider;
    }
    function kitFor(group, prefix) {
        let count = 0;
        function box(x, y, z, w, h, d, material = 'concrete', options = {}) {
            const mesh = new THREE.Mesh(cube, typeof material === 'string' ? materials[material] || materials.concrete : material);
            mesh.name = prefix;
            mesh.position.set(x, y, z);
            mesh.scale.set(w, h, d);
            mesh.rotation.y = options.rotationY || 0;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.userData.batch = true;
            group.add(mesh);
            if (options.collider)
                addCollider(`${prefix}-prop-${count++}`, x, y, z, w, h, d);
            return mesh;
        }
        function cylinder(x, y, z, radius, height, material = 'metal', options = {}) {
            const mesh = new THREE.Mesh(cylinderGeometry, typeof material === 'string' ? materials[material] || materials.metal : material);
            mesh.name = prefix;
            mesh.position.set(x, y, z);
            mesh.scale.set(radius, height, radius);
            mesh.rotation.y = options.rotationY || 0;
            mesh.userData.batch = true;
            group.add(mesh);
            return mesh;
        }
        function label(text, x, y, z, options = {}) {
            const canvas = document.createElement('canvas');
            const width = options.width || 3.7, height = options.height || .85;
            canvas.width = 1024;
            canvas.height = Math.max(64, Math.round(1024 * height / width));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = options.background || '#263e3a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = options.color || '#e2e9d6';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lines = String(text).split('\n');
            const longest = Math.max(...lines.map(line => line.length));
            const fontSize = Math.min(canvas.height * .6 / lines.length, 950 / (longest * .58)) * Math.min(1, (options.fontSize || 70) / 70);
            ctx.font = `${options.serif ? '600' : '500'} ${fontSize}px ${options.serif ? 'Georgia' : 'Arial'}`;
            lines.forEach((line, i) => ctx.fillText(line, 512, canvas.height / 2 + (i - (lines.length - 1) / 2) * fontSize * 1.35, 950));
            const t = new THREE.CanvasTexture(canvas);
            t.colorSpace = THREE.SRGBColorSpace;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(options.width || 3.7, options.height || .85), new THREE.MeshBasicMaterial({
                map: t, side: THREE.DoubleSide
            }));
            mesh.position.set(x, y, z);
            mesh.name = `${prefix} sign: ${text}`;
            mesh.rotation.y = options.rotation || 0;
            group.add(mesh);
            return mesh;
        }
        function plaque(text, x, y, z, options = {}) {
            const { width = 3, height = .75, rotation = 0 } = options;
            const thickness = .075;
            box(x, y, z, width + .10, height + .10, thickness, 'bronze', { rotationY: rotation });
            const front = thickness / 2 + .009;
            return label(text, x + Math.sin(rotation) * front, y, z + Math.cos(rotation) * front, {
                ...options, width, height, rotation, background: options.background || '#342a21', color: options.color || '#eedbb2', serif: true
            });
        }
        return {
            box, cylinder, label, plaque, materials, group, colliders, addCollider, fixture
        };
    }
    // Subtract explicit shaft / atrium rectangles; geometry and walkable supports share the result.
    function subtract(rect, hole) {
        if (hole.maxX <= rect.minX || hole.minX >= rect.maxX || hole.maxZ <= rect.minZ || hole.minZ >= rect.maxZ)
            return [rect];
        const x0 = Math.max(rect.minX, hole.minX), x1 = Math.min(rect.maxX, hole.maxX), z0 = Math.max(rect.minZ, hole.minZ), z1 = Math.min(rect.maxZ, hole.maxZ);
        return [{
                minX: rect.minX, maxX: x0, minZ: rect.minZ, maxZ: rect.maxZ
            }, {
                minX: x1, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ
            }, {
                minX: x0, maxX: x1, minZ: rect.minZ, maxZ: z0
            }, {
                minX: x0, maxX: x1, minZ: z1, maxZ: rect.maxZ
            }].filter(r => r.maxX - r.minX > .001 && r.maxZ - r.minZ > .001);
    }
    function slab(kit, rect, y, material, id, thickness = .24) {
        const { minX, maxX, minZ, maxZ } = rect;
        kit.box((minX + maxX) / 2, y - thickness / 2, (minZ + maxZ) / 2,
            maxX - minX, thickness, maxZ - minZ, material).castShadow = true;
        supports.push({ ...rect, y, id });
        structure.push({ id, min: [minX, y - thickness, minZ], max: [maxX, y, maxZ] });
    }

    // Build each shared wall once. Cuts come directly from the same door registry
    // used for player interaction and the audit.
    function wallsFor(floor, kit) {
        const y = floor.y;
        const runs = new Map();
        function run(axis, fixed, min, max, exterior = false) {
            const key = `${axis}:${fixed}`;
            if (!runs.has(key)) runs.set(key, { axis, fixed, ranges: [], exterior });
            runs.get(key).ranges.push([min, max]);
        }
        function enclose(rect, hallUpper = false) {
            if (rect.minZ !== BUILDING.minZ && !hallUpper) run('x', rect.minZ, rect.minX, rect.maxX);
            if (rect.maxZ !== BUILDING.maxZ) run('x', rect.maxZ, rect.minX, rect.maxX);
            if (rect.minX !== BUILDING.minX) run('z', rect.minX, rect.minZ, rect.maxZ);
            if (rect.maxX !== BUILDING.maxX) run('z', rect.maxX, rect.minZ, rect.maxZ);
        }
        run('x', BUILDING.minZ, BUILDING.minX, BUILDING.maxX, true);
        run('x', BUILDING.maxZ, BUILDING.minX, BUILDING.maxX, true);
        run('z', BUILDING.minX, BUILDING.minZ, BUILDING.maxZ, true);
        run('z', BUILDING.maxX, BUILDING.minZ, BUILDING.maxZ, true);
        for (const room of ROOMS.filter(room => room.floor === floor.id)) {
            const [min, max] = [room.bounds.min, room.bounds.max];
            enclose({ minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2] });
        }
        if (floor.id === 'L2') enclose(HALL, true);

        // Partition adjoining volumes so there are no shared coplanar outside faces
        // at the intersections of perpendicular walls.
        const nextFloor = FLOORS.find(candidate => candidate.y > y);
        const occupied = nextFloor ? structure.filter(part => part.max[1] === nextFloor.y) : [];
        function subtractVolume(box, prior) {
            const min = box.min.map((n, i) => Math.max(n, prior.min[i]));
            const max = box.max.map((n, i) => Math.min(n, prior.max[i]));
            if (min.some((n, i) => n >= max[i] - .00001)) return [box];
            const core = { min: [...box.min], max: [...box.max] };
            const parts = [];
            for (let axis = 0; axis < 3; axis++) {
                if (core.min[axis] < min[axis] - .00001) {
                    const piece = { min: [...core.min], max: [...core.max] };
                    piece.max[axis] = min[axis];
                    parts.push(piece);
                    core.min[axis] = min[axis];
                }
                if (core.max[axis] > max[axis] + .00001) {
                    const piece = { min: [...core.min], max: [...core.max] };
                    piece.min[axis] = max[axis];
                    parts.push(piece);
                    core.max[axis] = max[axis];
                }
            }
            return parts;
        }
        for (const wall of runs.values()) {
            const { axis, fixed, exterior } = wall;
            const across = axis === 'x' ? 0 : 2;
            const normal = axis === 'x' ? 2 : 0;
            const ranges = [];
            for (const [min, max] of wall.ranges.sort((a, b) => a[0] - b[0])) {
                const last = ranges.at(-1);
                if (last && min <= last[1] + .00001) last[1] = Math.max(last[1], max);
                else ranges.push([min, max]);
            }
            const openings = DOORS.filter(door => door.floor === floor.id && door.axis === axis &&
                Math.abs(door.position[normal] - fixed) < .00001);
            const windows = exterior && floor.id !== 'B1'
                ? axis === 'x' ? [-22.3, -17.1, -5.8, 5.8, 17.1, 22.3] : [-14, -7, 7, 14]
                : [];
            const top = nextFloor?.y ?? BUILDING.height - .24;
            let parts = ranges.map(([minX, maxX]) => ({ minX, maxX, minZ: y, maxZ: top }));
            for (const door of openings) {
                const center = door.position[across];
                parts = parts.flatMap(part => subtract(part, {
                    minX: center - door.width / 2 - .018, maxX: center + door.width / 2 + .018,
                    minZ: y, maxZ: y + door.height + .018
                }));
            }
            for (const center of windows) {
                parts = parts.flatMap(part => subtract(part, {
                    minX: center - 1.25, maxX: center + 1.25, minZ: y + .85, maxZ: y + 3.7
                }));
                const xyz = axis === 'x' ? [center, y + 2.275, fixed] : [fixed, y + 2.275, center];
                addCollider(`${floor.id}-window-${axis}-${fixed}-${center}`, ...xyz,
                    axis === 'x' ? 2.5 : .16, 2.85, axis === 'x' ? .16 : 2.5);
            }
            const finish = exterior ? floor.id === 'B1' ? 'concrete' : 'limestone'
                : floor.id === 'B1' ? 'concrete' : 'wall';
            const thickness = exterior ? .3 : .22;
            for (const part of parts) {
                const min = [0, part.minZ, 0], max = [0, part.maxZ, 0];
                min[across] = part.minX; max[across] = part.maxX;
                min[normal] = fixed - thickness / 2; max[normal] = fixed + thickness / 2;
                let pieces = [{ min, max }];
                for (const prior of occupied) pieces = pieces.flatMap(piece => subtractVolume(piece, prior));
                for (const box of pieces) {
                    const size = box.max.map((n, i) => n - box.min[i]);
                    const center = box.max.map((n, i) => (n + box.min[i]) / 2);
                    const id = `${floor.id}-wall-${occupied.length}`;
                    kit.box(...center, ...size, finish).castShadow = floor.id !== 'B1';
                    addCollider(id, ...center, ...size);
                    structure.push({ id, ...box });
                    occupied.push(box);
                }
            }
        }
    }

    for (const floor of FLOORS) {
        const group = new THREE.Group();
        group.name = floor.id;
        root.add(group);
        groups.set(floor.id, group);
        const kit = kitFor(group, floor.id);
        let regions = [BUILDING];
        const holes = FLOOR_HOLES.filter(hole => hole.floor === floor.id);
        if (floor.id === 'L1') holes.push({ ...HALL, kind: 'hall-floor' });
        for (const hole of holes) regions = regions.flatMap(region => subtract(region, hole));
        for (const [index, region] of regions.entries()) slab(kit, region, floor.y, 'floor', `${floor.id}-slab-${index}`);
        if (floor.id === 'L1') {
            // Tiles form the top of the slab. The underside is a continuous basement ceiling.
            const columns = 14, rows = 12;
            const width = (HALL.maxX - HALL.minX) / columns;
            const depth = (HALL.maxZ - HALL.minZ) / rows;
            supports.push({ ...HALL, y: floor.y, id: 'hall-floor' });
            structure.push({ id: 'hall-floor', min: [HALL.minX, -.24, HALL.minZ], max: [HALL.maxX, 0, HALL.maxZ] });
            kit.box(0, -.135, (HALL.minZ + HALL.maxZ) / 2,
                HALL.maxX - HALL.minX, .21, HALL.maxZ - HALL.minZ, 'floor').castShadow = true;
            for (let x = 0; x < columns; x++) for (let z = 0; z < rows; z++) {
                const mirror = Math.min(x, columns - 1 - x);
                kit.box(HALL.minX + (x + .5) * width, -.015, HALL.minZ + (z + .5) * depth,
                    width, .03, depth, (mirror + z) % 4 === 0 ? 'stoneDark' : 'marble');
            }
        }
        if (floor.id === 'L2') {
            for (const [index, region] of GALLERY.entries()) slab(kit, region, floor.y, 'marble', `gallery-${index}`);
        }
    }
    const exterior = new THREE.Group();
    root.add(exterior);
    groups.set('exterior', exterior);
    const street = kitFor(exterior, 'bank-exterior');
    for (const [index, region] of subtract(GROUNDS, BUILDING).entries()) slab(street, region, 0, 'asphalt', `street-${index}`);

    for (const floor of FLOORS) {
        const group = groups.get(floor.id);
        const kit = kitFor(group, floor.id);
        const color = floor.id === 'B1' ? '#e6edf5' : '#ffd7a0';
        wallsFor(floor, kit);
        for (const x of [-22, -13, -5, 5, 13, 22]) {
            kit.box(x, floor.y + 4.08, 0, 1.45, .10, .24, 'light');
            fixture(x, floor.y + 3.87, 0, { range: 8, strength: 11, color });
        }
        for (const room of ROOMS.filter(room => room.floor === floor.id)) {
            const roomKit = kitFor(group, room.id);
            if (room.kind === 'lobby') decorateBankHall(room, roomKit);
            else if (room.kind !== 'stairs') furnishBankRoom(room, roomKit, DOORS.find(door => door.id === room.doors[0]));
            if (room.kind === 'lobby') continue;
            const [x, y, z] = room.center;
            const ceilingLights = room.kind === 'stairs'
                ? [[Math.sign(x) * 19.2, z - 2], [Math.sign(x) * 19.2, z + 2]]
                : [[x - 1.8, z], [x + 1.8, z]];
            for (const [lightX, lightZ] of ceilingLights) {
                roomKit.box(lightX, y + 4.08, lightZ, 1.2, .10, .25, 'light');
                fixture(lightX, y + 3.87, lightZ, { color });
            }
        }
    }

    const steps = new THREE.Group();
    root.add(steps);
    groups.set('stairs', steps);
    for (const ramp of SUPPORTS) {
        const kit = kitFor(steps, ramp.id);
        const grand = ramp.id === GRAND_STAIR.id;
        const count = 26;
        const length = ramp.zMax - ramp.zMin;
        const rise = ramp.upperY - ramp.lowerY;
        const treadDepth = length / count;
        const stepRise = rise / count;
        // Leave room for the player's forward radius to overhang the next tread.
        const treadClearance = PLAYER.radius * rise / length + .02;
        const runner = [];
        function runnerFace(y0, z0, y1, z1) {
            runner.push(-1.01, y0, z0, 1.01, y0, z0, 1.01, y1, z1,
                -1.01, y0, z0, 1.01, y1, z1, -1.01, y1, z1);
        }
        for (let index = 0; index < count; index++) {
            const z = ramp.zMax - (index + .5) * treadDepth;
            const top = ramp.lowerY + (index + 1) * stepRise;
            const height = grand ? top - ramp.lowerY : .19;
            kit.box(ramp.x, top - height / 2, z, ramp.width, height, treadDepth, grand ? 'marble' : 'concrete');
            const collisionTop = top - stepRise - treadClearance;
            const collisionBase = grand ? ramp.lowerY : collisionTop - .20;
            if (collisionTop > collisionBase) addCollider(`${ramp.id}-tread-${index}`, ramp.x, (collisionTop + collisionBase) / 2,
                z, ramp.width, collisionTop - collisionBase, treadDepth);
            if (grand) {
                const edge = ramp.zMax - index * treadDepth + .008;
                runnerFace(top - stepRise + .008, edge, top + .008, edge);
                runnerFace(top + .008, edge, top + .008, edge - treadDepth);
            }
        }
        if (grand) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(runner, 3));
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, materials.burgundy);
            mesh.name = 'grand stair runner';
            mesh.receiveShadow = true;
            steps.add(mesh);
        }
        for (const side of [-1, 1]) {
            const x = ramp.x + side * (ramp.width / 2 + .055);
            const rail = kit.box(x, (ramp.lowerY + ramp.upperY) / 2 + .99, (ramp.zMin + ramp.zMax) / 2,
                .10, .095, Math.hypot(length, rise), grand ? 'darkWood' : 'metal');
            rail.rotation.x = Math.atan2(rise, length);
            for (let index = 1; index < count; index++) {
                const z = ramp.zMax - index * treadDepth;
                const y = ramp.lowerY + index * stepRise;
                if (index % 2) kit.cylinder(x, y + .5, z, .023, 1, grand ? 'bronze' : 'metal');
                addCollider(`${ramp.id}-guard-${side}-${index}`, x, y + .45, z, .085, 1.02, treadDepth);
            }
        }
    }
    supports.push(...SUPPORTS);
    const hall = kitFor(groups.get('L1'), 'hall-detail');
    const upper = kitFor(groups.get('L2'), 'gallery-detail');
    hall.box(0, .008, 16.465, 2.02, .014, 4.93, 'burgundy');
    function landingRail(kit, id, x, y, z, length, axis, finish) {
        const width = axis === 'x' ? length : .095;
        const depth = axis === 'z' ? length : .095;
        kit.box(x, y + 1.04, z, width, .085, depth, finish);
        addCollider(id, x, y + .55, z, width, 1.1, depth);
        for (let t = -length / 2 + .23; t < length / 2; t += .46) {
            kit.cylinder(axis === 'x' ? x + t : x, y + .52, axis === 'z' ? z + t : z, .026, 1.04, 'bronze');
        }
    }
    for (const side of [-1, 1]) {
        landingRail(upper, `gallery-front-${side}`, side * 4.835, 4.4, 4.22, 6.33, 'x', 'darkWood');
        landingRail(upper, `gallery-side-${side}`, side * 8.04, 4.4, 11.56, 14.58, 'z', 'darkWood');
        // Hang art on the solid upper side walls, outside every door's swept volume.
        const x = side * 9.86, rotation = -side * Math.PI / 2;
        upper.box(x, 6.28, 14.75, 2.65, .94, .06, 'darkWood', { rotationY: rotation });
        upper.box(x - side * .042, 6.28, 14.75, 2.46, .82, .02, 'painting', { rotationY: rotation });
    }
    for (const ramp of SUPPORTS.filter(ramp => ramp !== GRAND_STAIR)) {
        const floor = FLOORS.find(floor => floor.y === ramp.upperY);
        const kit = kitFor(groups.get(floor.id), `${ramp.id}-landing`);
        const length = ramp.zMax - ramp.zMin;
        for (const side of [-1, 1]) {
            const x = ramp.x + side * (ramp.width / 2 + .19);
            landingRail(kit, `${ramp.id}-landing-side-${side}`, x, floor.y,
                (ramp.zMax + ramp.zMin) / 2, length, 'z', 'metal');
        }
        if (floor.id === 'L2') {
            landingRail(kit, `${ramp.id}-landing-end`, ramp.x, floor.y,
                ramp.zMax + .12, ramp.width + .28, 'x', 'metal');
        }
    }

    let world;
    function placeDoor(definition) {
        const kit = kitFor(groups.get(definition.floor), definition.id);
        if (definition.kind === 'vault') {
            doors.set(definition.id, createVaultDoor(definition, kit, () => world?.player));
            return;
        }
        const [x, y, z] = definition.position;
        const along = definition.axis === 'x' ? 0 : 2;
        const normal = definition.axis === 'x' ? 2 : 0;
        const rotation = along === 0 ? 0 : Math.PI / 2;
        const direction = along === 0 && x < 0 ? -1 : 1;
        const half = definition.width / 2;
        const edge = definition.position[along] + direction * (half + .014);
        const plane = new THREE.Vector3();
        plane.setComponent(along, -direction);
        const clipping = new THREE.Plane(plane, direction * edge);
        const leafMaterial = name => {
            const source = materials[name];
            const material = source.clone();
            material.onBeforeCompile = source.onBeforeCompile;
            material.customProgramCacheKey = source.customProgramCacheKey;
            material.clippingPlanes = [clipping];
            return material;
        };
        const leaf = new THREE.Group();
        leaf.name = `${definition.id} moving leaf`;
        leaf.position.set(x, y, z);
        leaf.rotation.y = rotation;
        kit.group.add(leaf);
        const finish = definition.kind === 'entrance' ? 'glass' : 'darkWood';
        const panel = new THREE.Mesh(cube, leafMaterial(finish));
        panel.scale.set(definition.width, definition.height - .035, .115);
        panel.position.y = definition.height / 2;
        panel.receiveShadow = true;
        leaf.add(panel);
        const handle = new THREE.Mesh(cube, leafMaterial('brass'));
        handle.scale.set(.04, .29, .17);
        handle.position.set(-half + .25, 1.13, 0);
        leaf.add(handle);
        for (const side of [-1, 1]) {
            const point = [...definition.position];
            point[along] += side * (half + .05);
            point[1] += (definition.height + .012) / 2;
            kit.box(...point, .1, definition.height - .012, .29, 'bronze', { rotationY: rotation });
        }
        kit.box(x, y + definition.height + .05, z, definition.width + .2, .10, .29, 'bronze', { rotationY: rotation });
        const room = ROOMS.find(room => room.id === definition.roomId);
        if (room && definition.id !== 'L1-lobby-entry') {
            // Every plaque is entirely above its lintel, mounted to the solid wall face.
            const outward = -definition.inward;
            const position = doorPoint(definition, 0, -.145);
            position[1] = y + definition.height + .30;
            kit.plaque(room.name.toUpperCase(), ...position, {
                width: Math.min(definition.width - .19, 2.45), height: .27,
                rotation: along === 0 ? outward > 0 ? 0 : Math.PI : outward * Math.PI / 2
            });
        }
        const collider = addCollider(definition.id, x, y + definition.height / 2, z,
            along === 0 ? definition.width : .13, definition.height, along === 0 ? .13 : definition.width);
        const runtime = {
            definition, object: leaf, collider, open: false, locked: false, progress: 0,
            setOpen(value) {
                if (value && this.locked) return false;
                if (!value && world?.player) {
                    const p = world.player.position.toArray();
                    const distance = Math.abs(p[normal] - definition.position[normal]);
                    const lateral = Math.abs(p[along] - definition.position[along]);
                    if (Math.abs(p[1] - y) < 1.5 && distance < .48 && lateral < half + .32) return false;
                }
                this.open = Boolean(value);
                return true;
            },
            setLocked(value) { this.locked = Boolean(value); },
            update(dt, player) {
                const previous = this.progress;
                this.progress = THREE.MathUtils.clamp(this.progress + (this.open ? 1 : -1) * dt / .32, 0, 1);
                const updateCollider = () => {
                    collider.enabled = this.progress < 1;
                    if (!collider.enabled) return;
                    const travel = direction * Math.min(definition.width - .001, (definition.width + .02) * this.progress);
                    collider.min[along] = definition.position[along] - half + Math.max(0, travel);
                    collider.max[along] = definition.position[along] + half + Math.min(0, travel);
                };
                updateCollider();
                if (!this.open && player && overlapsCollider(player.position, collider)) {
                    this.progress = previous;
                    this.open = true;
                    updateCollider();
                }
                leaf.position.setComponent(along, definition.position[along] + direction * (definition.width + .02) * this.progress);
                leaf.visible = this.progress < 1;
            }
        };
        doors.set(definition.id, runtime);
    }
    for (const definition of DOORS) placeDoor(definition);

    decorateBankExterior(street);
    const city = new THREE.Group();
    root.add(city);
    groups.set('city', city);
    buildCity(kitFor(city, 'city'));
    for (const side of [-1, 1]) {
        addCollider(`boundary-x-${side}`, side * 40.24, 1.6, 0, .48, 3.2, 62.96);
        addCollider(`boundary-z-${side}`, 0, 1.6, side * 31.24, 80.96, 3.2, .48);
    }
    const skylight = { minX: -4.8, maxX: 4.8, minZ: 7, maxZ: 14.4 };
    for (const region of subtract(BUILDING, skylight)) {
        street.box((region.minX + region.maxX) / 2, 8.68, (region.minZ + region.maxZ) / 2,
            region.maxX - region.minX, .24, region.maxZ - region.minZ, 'stoneTrim');
    }
    street.box(0, 8.76, 10.7, 9.6, .08, 7.4, 'glass');
    for (const x of [-4.8, -2.42, 0, 2.42, 4.8]) street.box(x, 8.74, 10.7, .10, .19, 7.30, 'bronze');
    for (const z of [7, 14.4]) street.box(0, 8.74, z, 9.7, .19, .1, 'bronze');

    const vaultKit = kitFor(groups.get('B1'), 'vault-asset');
    const [assetX, assetY, assetZ] = OBJECTIVE.position;
    vaultKit.cylinder(assetX, assetY + .4, assetZ, .63, .8, 'stoneDark');
    vaultKit.cylinder(assetX, assetY + .83, assetZ, .69, .06, 'brass');
    addCollider('vault-objective-pedestal', assetX, assetY + .43, assetZ, 1.38, .86, 1.38);
    const asset = new THREE.Mesh(new THREE.OctahedronGeometry(.42), materials.brass);
    asset.position.set(assetX, assetY + 1.28, assetZ);
    groups.get('B1').add(asset);
    fixture(assetX, assetY + 2.65, assetZ, { range: 4.5, strength: 5 });

    const approach = kitFor(groups.get('B1'), 'vault-approach');
    const approachCenter = (VAULT_APPROACH.minZ + VAULT_APPROACH.maxZ) / 2;
    const approachDepth = VAULT_APPROACH.maxZ - VAULT_APPROACH.minZ;
    for (const x of [-2.33, 2.33]) {
        approach.box(x, assetY + .008, approachCenter, .095, .016, approachDepth - .24, 'stoneDark');
        approach.box(x, assetY + 4.10, approachCenter, .18, .12, 3.18, 'bronze');
        approach.box(x, assetY + 4.015, approachCenter, .105, .055, 2.98, 'light');
        for (const depth of [approachCenter - 1.1, approachCenter + .95])
            fixture(x, assetY + 3.78, depth, { range: 5.5, strength: 8, color: '#f7e6cb' });
    }
    const facadeZ = VAULT_APPROACH.minZ + .14;
    for (const side of [-1, 1]) {
        approach.box(side * 4.59, assetY + .17, facadeZ, 4.4, .32, .13, 'stoneDark');
        approach.box(side * 4.59, assetY + .355, facadeZ + .012, 4.38, .05, .14, 'bronze');
        for (const x of [2.75, 6.1]) {
            approach.box(side * x, assetY + 2.11, facadeZ + .016, .33, 3.51, .10, 'stoneTrim');
            approach.box(side * x, assetY + 3.93, facadeZ + .028, .45, .15, .14, 'stoneTrim');
        }
    }
    fixture(0, assetY + 2.92, VAULT_APPROACH.minZ + 1.5, { range: 4.5, strength: 8, color: '#ffe4ae' });

    const liftGroup = new THREE.Group();
    root.add(liftGroup);
    const car = kitFor(liftGroup, 'elevator-car');
    const z = ELEVATOR.position[2];
    car.box(0, -.07, z, 2.82, .14, 2.78, 'metal');
    car.box(0, 2.95, z, 2.82, .14, 2.78, 'stoneTrim');
    car.box(0, 2.86, z, 1.35, .055, .25, 'light');
    car.plaque('FLOOR SELECT\n1  B1  ·  2  L1  ·  3  L2', 1.37, 1.62, z, {
        width: 1.12, height: .37, rotation: -Math.PI / 2,
    });
    const liftSupport = { id: 'elevator-car', minX: -1.42, maxX: 1.42, minZ: -6.9, maxZ: -4.1, y: 0 };
    supports.push(liftSupport);
    const shaft = kitFor(root, 'shaft');
    for (const x of [-1.484, 1.484]) {
        shaft.box(x, 2.08, z, .14, 12.96, 2.94, 'stoneTrim');
        addCollider(`shaft-${x}`, x, 2.08, z, .14, 12.96, 2.94);
    }
    // The basement car opens on both sides. The rear exit faces the vault.
    const basement = FLOORS[0];
    const rearZ = ELEVATOR.bounds.min[2] - .064;
    const rearOpeningTop = basement.y + 3;
    const shaftTop = ELEVATOR.bounds.max[1] - .24;
    const rearWallCenter = (rearOpeningTop + shaftTop) / 2;
    shaft.box(0, rearWallCenter, rearZ, 2.828, shaftTop - rearOpeningTop, .14, 'stoneTrim');
    addCollider('shaft-rear-wall', 0, rearWallCenter, rearZ, 2.828, shaftTop - rearOpeningTop, .14);
    const gates = FLOORS.map(floor => {
        const kit = kitFor(groups.get(floor.id), 'elevator-stop');
        const gate = kit.box(0, floor.y + 1.5, -4.12, 2.816, 3, .12, 'metal');
        gate.userData.batch = false;
        kit.box(0, floor.y + 3.58, -4.12, 2.828, 1.16, .22, 'stoneTrim');
        kit.plaque(`LIFT  ·  ${floor.id}`, 0, floor.y + 3.30, -3.973, { width: 1.5, height: .26 });
        kit.box(ELEVATOR_CALL[0], floor.y + 1.18, ELEVATOR_CALL[1] - .17, .4, 2.55, .34, 'stoneTrim');
        kit.box(ELEVATOR_CALL[0], floor.y + 1.23, ELEVATOR_CALL[1] + .025, .17, .28, .06, 'bronze');
        const collider = addCollider(`elevator-gate-${floor.id}`, 0, floor.y + 1.5, -4.12, 2.84, 3, .14);
        addCollider(`elevator-call-${floor.id}`, ELEVATOR_CALL[0], floor.y + 1.18, ELEVATOR_CALL[1] - .17, .4, 2.55, .34);
        return { ...floor, mesh: gate, collider };
    });
    const rear = kitFor(groups.get('B1'), 'elevator-stop-rear');
    const rearGate = rear.box(0, basement.y + 1.5, rearZ, 2.816, 3, .12, 'metal');
    rearGate.userData.batch = false;
    rear.plaque('LIFT  ·  B1', 0, basement.y + 3.30, rearZ - .107, { width: 1.5, height: .26, rotation: Math.PI });
    rear.box(1.63, basement.y + 1.23, rearZ - .006, .29, .44, .15, 'stoneTrim');
    rear.box(1.63, basement.y + 1.23, rearZ - .089, .16, .25, .025, 'bronze');
    gates.push({
        ...basement, mesh: rearGate,
        collider: addCollider('elevator-gate-B1-rear', 0, basement.y + 1.5, rearZ, 2.84, 3, .14),
    });
    const lift = {
        y: 0, target: 0, moving: false, car: liftGroup, support: liftSupport, gates, passenger: false,
        moveTo(y, passenger = false) {
            if (this.moving || !FLOORS.some(floor => floor.y === y)) return false;
            this.target = y;
            this.passenger = passenger;
            this.moving = Math.abs(y - this.y) > .001;
            return true;
        }
    };

    function batchGroup(root) {
        const byKey = new Map();
        root.traverse(mesh => {
            if (!mesh.isMesh || !mesh.userData.batch) return;
            mesh.castShadow ||= root === exterior && !mesh.material.transparent && mesh.material !== materials.light;
            const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.castShadow}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(mesh);
        });
        root.updateMatrixWorld(true);
        const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
        for (const meshes of byKey.values()) {
            if (meshes.length < 3) continue;
            const instance = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
            instance.name = `${root.name || 'architecture'} batch: ${meshes[0].material.name}`;
            instance.userData.parts = meshes.map(mesh => mesh.name);
            for (const [index, mesh] of meshes.entries()) {
                instance.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
                mesh.removeFromParent();
            }
            instance.receiveShadow = true;
            instance.castShadow = meshes[0].castShadow;
            instance.computeBoundingSphere();
            root.add(instance);
            batches.push(instance);
        }
    }
    const auditBoxes = [];
    if (audit) {
        root.updateMatrixWorld(true);
        root.traverse(mesh => {
            if (mesh.geometry !== cube || mesh.parent?.name.endsWith('moving leaf')) return;
            const matrix = mesh.matrixWorld.elements;
            if ([0, 4, 8].some(offset => [0, 1, 2].filter(axis => Math.abs(matrix[offset + axis]) > .00001).length !== 1)) return;
            const bounds = new THREE.Box3().setFromObject(mesh);
            auditBoxes.push({ name: mesh.name, material: mesh.material.name, min: bounds.min.toArray(), max: bounds.max.toArray() });
        });
    }
    for (const group of groups.values()) batchGroup(group);
    batchGroup(liftGroup);
    fixtureField.bake(fixtures, structure);
    world = {
        groups, colliders, supports, doors, structure, auditBoxes, materials, asset, lift, root, player: null,
        stats: { rooms: ROOMS.length, colliders: colliders.length, instances: batches.reduce((sum, mesh) => sum + mesh.count, 0) },
        update(dt, time, player) {
            asset.rotation.y = time * .3;
            for (const door of doors.values()) door.update(dt, player);
            if (lift.moving) {
                const before = lift.y;
                lift.y += Math.sign(lift.target - lift.y) * Math.min(Math.abs(lift.target - lift.y), dt * 2.25);
                if (lift.passenger && player) player.position.y += lift.y - before;
                if (Math.abs(lift.y - lift.target) < .001) lift.moving = false;
            }
            liftGroup.position.y = lift.y;
            liftSupport.y = lift.y;
            for (const gate of gates) {
                const open = !lift.moving && Math.abs(gate.y - lift.y) < .05;
                gate.mesh.visible = !open;
                gate.collider.enabled = !open;
            }
        },
        dispose() {
            fixtureField.dispose();
            const resources = new Set();
            root.traverse(mesh => {
                if (!mesh.isMesh) return;
                resources.add(mesh.geometry);
                for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                    resources.add(material);
                    for (const texture of [material.map, material.normalMap, material.roughnessMap]) if (texture) resources.add(texture);
                }
            });
            for (const resource of resources) resource.dispose();
            root.removeFromParent();
        }
    };
    world.update(0, 0);
    return world;
}
