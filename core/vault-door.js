import * as THREE from '../vendor/three.module.js';
import { overlapsCollider } from './controller.js';

const UNLOCK_SECONDS = .78;
const SWING_SECONDS = 1.42;
const TOTAL_SECONDS = UNLOCK_SECONDS + SWING_SECONDS;
const OPEN_ANGLE = THREE.MathUtils.degToRad(110);
const WHEEL_TURN = Math.PI * 2.7;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ease = value => value * value * (3 - 2 * value);

function circleOutline(radius, centerY, bottom) {
    const start = Math.asin((bottom - centerY) / radius);
    return Array.from({ length: 73 }, (_, index) => {
        const angle = start + (Math.PI - 2 * start) * index / 72;
        return new THREE.Vector2(radius * Math.cos(angle), centerY + radius * Math.sin(angle));
    });
}

function solid(parent, material, name, geometry, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function profile(outline, depth, hole, bevel = 0) {
    const shape = new THREE.Shape(outline);
    if (hole) shape.holes.push(new THREE.Path(hole));
    return new THREE.ExtrudeGeometry(shape, {
        depth, steps: 1, bevelEnabled: bevel > 0,
        bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
}

function tinted(source, color, metalness, roughness) {
    const material = source.clone();
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
    material.color.set(color);
    material.metalness = metalness;
    material.roughness = roughness;
    return material;
}

function makeHandwheel(parent, materials, name, x, y, z, scale = 1) {
    const wheel = new THREE.Group();
    wheel.name = name;
    wheel.position.set(x, y, z);
    wheel.scale.setScalar(scale);
    parent.add(wheel);
    const disc = (radius, depth, material) => {
        const hub = solid(wheel, material, name, new THREE.CylinderGeometry(radius, radius, depth, 24));
        hub.rotation.x = Math.PI / 2;
        return hub;
    };
    solid(wheel, materials.brass, name, new THREE.TorusGeometry(.52, .052, 12, 64));
    disc(.146, .105, materials.brass);
    disc(.076, .125, materials.steel);
    for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const spoke = solid(wheel, materials.brass, name, unitBox, .293 * Math.cos(angle), .293 * Math.sin(angle));
        spoke.scale.set(.064, .441, .066);
        spoke.rotation.z = angle - Math.PI / 2;
    }
    const grip = solid(wheel, materials.steel, name, new THREE.CylinderGeometry(.047, .058, .15, 16), .52, 0, .07);
    grip.rotation.x = Math.PI / 2;
    return wheel;
}

/** A heavy hinged leaf keeps its position and its collision after opening. */
export function createVaultDoor(definition, kit, getPlayer = () => null) {
    const { id, position: [x, y, z], width, height, axis, inward } = definition;
    const yaw = axis === 'x' ? inward < 0 ? 0 : Math.PI : -inward * Math.PI / 2;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const centerY = height * .39;
    const frameRadius = Math.min(width / 2 - .045, height - centerY - .29);
    const apertureRadius = frameRadius - .12;
    const leafRadius = apertureRadius - .021;
    const sill = .01;
    const hingeX = -apertureRadius - .09;
    const hingeZ = -.27;
    const localCenter = -hingeX;
    const materials = {
        ...kit.materials,
        steel: tinted(kit.materials.metal, '#a5b3b5', .48, .39),
        casing: tinted(kit.materials.metal, '#576368', .50, .45),
    };
    const assembly = new THREE.Group();
    assembly.name = `${id} assembly`;
    assembly.position.set(x, y, z);
    assembly.rotation.y = yaw;
    kit.group.add(assembly);
    const colliderAt = (name, cx, cy, cz, w, h, d) => kit.addCollider(name,
        x + cx * cos + cz * sin, y + cy, z - cx * sin + cz * cos,
        w * Math.abs(cos) + d * Math.abs(sin), h, w * Math.abs(sin) + d * Math.abs(cos));

    const frameWidth = width / 2 + .026;
    const surround = [
        new THREE.Vector2(-frameWidth, -.043), new THREE.Vector2(frameWidth, -.043),
        new THREE.Vector2(frameWidth, height + .026), new THREE.Vector2(-frameWidth, height + .026),
    ];
    const frameCutout = circleOutline(frameRadius - .017, centerY, -.024);
    const aperture = circleOutline(apertureRadius, centerY, sill);
    solid(assembly, materials.stoneDark, `${id} masonry`, profile(surround, .31, frameCutout), 0, 0, -.151);
    solid(assembly, materials.casing, `${id} casing`,
        profile(circleOutline(frameRadius, centerY, -.028), .399, aperture, .006), 0, 0, -.191);
    solid(assembly, materials.bronze, `${id} bronze surround`,
        profile(circleOutline(frameRadius - .041, centerY, -.009), .038, aperture), 0, 0, .21);

    const plaqueZ = .211;
    kit.plaque('CENTRAL RESERVE', x + plaqueZ * sin, y + height - .21, z + plaqueZ * cos, {
        width: 1.95, height: .168, rotation: yaw,
    });
    const screw = new THREE.CylinderGeometry(.034, .038, .023, 12);
    for (let index = 0; index < 24; index++) {
        const angle = index * Math.PI / 12;
        const radius = frameRadius - .066;
        const boltY = centerY + radius * Math.sin(angle);
        if (boltY < .08) continue;
        const bolt = solid(assembly, materials.steel, `${id} frame bolt`, screw,
            radius * Math.cos(angle), boltY, .253);
        bolt.rotation.x = Math.PI / 2;
    }

    // The round aperture continues below the floor. Its visible bottom is a flat sill.
    const clearHalf = Math.sqrt(apertureRadius ** 2 - (centerY - sill) ** 2);
    for (const side of [-1, 1]) {
        const jambWidth = frameWidth - clearHalf;
        colliderAt(`${id}-jamb-${side}`, side * (clearHalf + jambWidth / 2), height / 2, 0, jambWidth, height, .42);
    }

    const hinge = new THREE.Group();
    hinge.name = `${id} moving leaf`;
    hinge.position.set(hingeX, 0, hingeZ);
    assembly.add(hinge);
    const leafShape = circleOutline(leafRadius, centerY, .032);
    solid(hinge, materials.casing, `${id} steel body`, profile(leafShape, .30, null, .012), localCenter, 0, -.25);
    solid(hinge, materials.steel, `${id} faceplate`,
        profile(circleOutline(leafRadius - .043, centerY, .05), .124, null, .012), localCenter, 0, .048);
    solid(hinge, materials.bronze, `${id} faceplate border`,
        profile(circleOutline(leafRadius - .084, centerY, .073), .025,
            circleOutline(leafRadius - .121, centerY, .101)), localCenter, 0, .176);
    const brace = solid(hinge, materials.casing, `${id} locking bar`, unitBox, localCenter, centerY, .202);
    brace.scale.set(2.6, .22, .076);
    for (const side of [-1, 1]) {
        const mount = solid(hinge, materials.steel, `${id} bar mount`, unitBox,
            localCenter + side * 1.16, centerY, .246);
        mount.scale.set(.215, .32, .067);
    }
    const hub = solid(hinge, materials.casing, `${id} wheel housing`,
        new THREE.CylinderGeometry(.31, .34, .11, 40), localCenter, centerY, .244);
    hub.rotation.x = Math.PI / 2;
    const shaft = solid(hinge, materials.steel, `${id} wheel shaft`,
        new THREE.CylinderGeometry(.105, .105, .21, 24), localCenter, centerY, .349);
    shaft.rotation.x = Math.PI / 2;
    const wheel = makeHandwheel(hinge, materials, `${id} handwheel`, localCenter, centerY, .458);
    const insideWheel = makeHandwheel(hinge, materials, `${id} interior handwheel`, localCenter, centerY, -.337, .66);
    insideWheel.rotation.order = 'YXZ';
    insideWheel.rotation.y = Math.PI;

    for (const hingeY of [.78, 2.44]) {
        solid(assembly, materials.steel, `${id} hinge pin`,
            new THREE.CylinderGeometry(.104, .104, .43, 24), hingeX, hingeY, hingeZ);
        const mounting = solid(assembly, materials.casing, `${id} hinge mounting`, unitBox,
            hingeX - .12, hingeY, hingeZ + .077);
        mounting.scale.set(.33, .38, .22);
        const strap = solid(hinge, materials.casing, `${id} hinge strap`, unitBox, .55, hingeY, -.23);
        strap.scale.set(1.15, .22, .112);
        const end = solid(hinge, materials.steel, `${id} hinge strap end`,
            new THREE.CylinderGeometry(.115, .115, .11, 20), 1.045, hingeY, -.23);
        end.rotation.x = Math.PI / 2;
    }
    for (const boltY of [.82, 1.27, 1.82, 2.29]) {
        const edge = Math.sqrt(leafRadius ** 2 - (boltY - centerY) ** 2);
        const bolt = solid(hinge, materials.steel, `${id} locking bolt`,
            new THREE.CylinderGeometry(.075, .075, .128, 16), localCenter + edge - .025, boltY, -.094);
        bolt.rotation.z = Math.PI / 2;
    }

    const collider = colliderAt(id, 0, height / 2, -.05, width, height, .39);
    const fullGate = { ...collider, enabled: true };
    const leafColliders = [];
    function leafCollider(name, localX, localY, localZ, halfWidth, colliderHeight, halfDepth) {
        leafColliders.push({
            localX, localZ, halfWidth, halfDepth,
            bounds: colliderAt(name, 0, localY, 0, halfWidth * 2, colliderHeight, halfDepth * 2),
        });
    }
    const slices = 12;
    const sliceWidth = 2 * leafRadius / slices;
    for (let i = 0; i < slices; i++) {
        const offsetX = (i + .5) * sliceWidth - leafRadius;
        const insideX = Math.max(0, Math.abs(offsetX) - sliceWidth / 2);
        const halfHeight = Math.sqrt(leafRadius ** 2 - insideX ** 2);
        const minY = Math.max(.02, centerY - halfHeight);
        const maxY = centerY + halfHeight + .012;
        leafCollider(`${id}-leaf-${i}`, localCenter + offsetX, (minY + maxY) / 2,
            -.046, sliceWidth / 2 + .018, maxY - minY, .221);
    }
    leafCollider(`${id}-wheel`, localCenter, centerY, .429, .566, 1.144, .169);
    leafCollider(`${id}-interior-wheel`, localCenter, centerY, -.32, .38, .77, .077);

    let elapsed = 0;
    function applyPose(seconds) {
        const swing = ease(THREE.MathUtils.clamp((seconds - UNLOCK_SECONDS) / SWING_SECONDS, 0, 1));
        hinge.rotation.y = swing * OPEN_ANGLE;
        wheel.rotation.z = ease(Math.min(1, seconds / UNLOCK_SECONDS)) * WHEEL_TURN;
        insideWheel.rotation.z = -wheel.rotation.z;
        const heading = yaw + hinge.rotation.y;
        const turnCos = Math.cos(heading), turnSin = Math.sin(heading);
        const pivotX = x + hingeX * cos + hingeZ * sin;
        const pivotZ = z - hingeX * sin + hingeZ * cos;
        for (const part of leafColliders) {
            const centerX = pivotX + part.localX * turnCos + part.localZ * turnSin;
            const centerZ = pivotZ - part.localX * turnSin + part.localZ * turnCos;
            const extentX = part.halfWidth * Math.abs(turnCos) + part.halfDepth * Math.abs(turnSin);
            const extentZ = part.halfWidth * Math.abs(turnSin) + part.halfDepth * Math.abs(turnCos);
            part.bounds.min[0] = centerX - extentX;
            part.bounds.max[0] = centerX + extentX;
            part.bounds.min[2] = centerZ - extentZ;
            part.bounds.max[2] = centerZ + extentZ;
        }
    }

    const door = {
        definition, object: hinge, collider, open: false, locked: false,
        get progress() { return elapsed / TOTAL_SECONDS; },
        get moving() { return this.open ? elapsed < TOTAL_SECONDS : elapsed > 0; },
        get phase() {
            if (this.open) return elapsed < UNLOCK_SECONDS ? 'unlocking' : elapsed < TOTAL_SECONDS ? 'opening' : 'open';
            return elapsed > UNLOCK_SECONDS ? 'closing' : elapsed > 0 ? 'locking' : 'closed';
        },
        setOpen(value) {
            const opening = Boolean(value);
            const player = getPlayer();
            if (opening && this.locked) return false;
            if (!opening && player && overlapsCollider(player.position, fullGate)) return false;
            this.open = opening;
            return true;
        },
        setLocked(value) { this.locked = Boolean(value); },
        reset() {
            this.open = false;
            this.locked = false;
            elapsed = 0;
            applyPose(elapsed);
            collider.enabled = true;
        },
        update(dt, player = getPlayer()) {
            const occupied = player && overlapsCollider(player.position, fullGate);
            if (!this.open && occupied) this.open = true;
            while (this.moving && dt > 0) {
                const step = Math.min(dt, .025);
                const next = THREE.MathUtils.clamp(elapsed + (this.open ? step : -step), 0, TOTAL_SECONDS);
                applyPose(next);
                const swinging = elapsed > UNLOCK_SECONDS || next > UNLOCK_SECONDS;
                if (swinging && player && leafColliders.some(part => overlapsCollider(player.position, part.bounds))) {
                    applyPose(elapsed);
                    if (!this.open) this.open = true;
                    break;
                }
                elapsed = next;
                dt -= step;
            }
            collider.enabled = elapsed < TOTAL_SECONDS && !occupied;
        },
    };
    door.reset();
    return door;
}
