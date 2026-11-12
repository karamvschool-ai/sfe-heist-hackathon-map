import * as THREE from './vendor/three.module.js';
import { createController, createLighting, createLightingPass, createWorld, ELEVATOR, ELEVATOR_CALL, FLOORS, floorAt } from './map.js';

const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8c7cf');
scene.fog = new THREE.Fog('#b8c7cf', 145, 410);
const camera = new THREE.PerspectiveCamera(72, 1, .08, 420);
const world = createWorld(scene);
const lighting = createLighting(scene, renderer);
const lightingPass = createLightingPass(renderer, camera);
renderer.shadowMap.needsUpdate = true;

const player = createController({
    camera, domElement: canvas, colliders: world.colliders, supports: world.supports,
    onInteract: interact,
});
world.player = player;
player.setEnabled(true);

function inLift() {
    const { min, max } = ELEVATOR.bounds;
    const { x, y, z } = player.position;
    return Math.abs(x) < max[0] - .35 && z > min[2] + .35 && z < max[2] - .35 &&
        Math.abs(y - world.lift.y) < .22;
}

function interact({ position, direction }) {
    if (world.lift.moving || inLift()) return;
    const { x, y, z } = position;
    let nearest;
    for (const door of world.doors.values()) {
        const d = door.definition;
        const [doorX, doorY, doorZ] = d.position;
        if (Math.abs(y - doorY) > .8 || door.moving) continue;
        const half = d.width / 2;
        const dx = (d.axis === 'x' ? THREE.MathUtils.clamp(x, doorX - half, doorX + half) : doorX) - x;
        const dz = (d.axis === 'z' ? THREE.MathUtils.clamp(z, doorZ - half, doorZ + half) : doorZ) - z;
        const distance = Math.hypot(dx, dz);
        if (distance > 2.7 || (distance > .2 && direction.x * dx + direction.z * dz < .26 * distance)) continue;
        if (!nearest || distance < nearest.distance) nearest = { door, distance };
    }
    const floor = floorAt(y);
    const front = Math.min(Math.hypot(x, z - ELEVATOR.bounds.max[2]), Math.hypot(x - ELEVATOR_CALL[0], z - ELEVATOR_CALL[1]));
    const rear = Math.hypot(x - 1.63, z - ELEVATOR.bounds.min[2]);
    const call = front < 2 && z > ELEVATOR.bounds.max[2] && direction.z < -.25 ? front
        : floor.id === 'B1' && rear < 2.1 && z < ELEVATOR.bounds.min[2] && direction.z > .25 ? rear : Infinity;
    if (Math.abs(y - floor.y) < .4 && call < (nearest?.distance ?? Infinity)) {
        world.lift.moveTo(floor.y);
    } else if (nearest) {
        nearest.door.setOpen(!nearest.door.open);
    }
}

function selectLiftFloor(event) {
    const match = /^(?:Digit|Numpad)([123])$/.exec(event.code);
    if (!match || event.repeat || !inLift()) return;
    const destination = FLOORS[Number(match[1]) - 1];
    if (Math.abs(world.lift.y - destination.y) > .05 && world.lift.moveTo(destination.y, true)) {
        player.setEnabled(false);
    }
}

function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    lightingPass.resize();
}

const captureMouse = () => player.lock();
canvas.addEventListener('click', captureMouse);
window.addEventListener('keydown', selectLiftFloor);
window.addEventListener('resize', resize);
resize();

let previous = performance.now();
let time = 0;
renderer.setAnimationLoop(now => {
    let remaining = Math.min((now - previous) / 1000, .25);
    previous = now;
    while (remaining > .00001) {
        const dt = Math.min(.05, remaining);
        const riding = world.lift.moving && world.lift.passenger;
        time += dt;
        world.update(dt, time, player);
        if (riding) {
            player.setPosition(player.position);
            if (!world.lift.moving) player.setEnabled(true);
        } else {
            player.update(dt);
        }
        remaining -= dt;
    }
    lighting.update(camera.position);
    lightingPass.render(scene);
});

window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    renderer.setAnimationLoop(null);
    canvas.removeEventListener('click', captureMouse);
    window.removeEventListener('keydown', selectLiftFloor);
    window.removeEventListener('resize', resize);
    player.dispose();
    lightingPass.dispose();
    lighting.dispose();
    world.dispose();
    renderer.dispose();
});
