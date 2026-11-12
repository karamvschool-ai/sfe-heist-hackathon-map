import * as THREE from '../vendor/three.module.js';
import { ENTRANCES } from './layout.js';
export const PLAYER = Object.freeze({
    radius: 0.32, height: 1.75, eyeHeight: 1.65, walkSpeed: 4.5, sprintSpeed: 7, stepHeight: 0.35
});
const EPSILON = 0.0001;
function xyz(position) {
    return {
        x: position.x ?? position[0], y: position.y ?? position[1], z: position.z ?? position[2]
    };
}
function supportHeight(support, x, z) {
    if (support.enabled === false || x < support.minX - EPSILON || x > support.maxX + EPSILON || z < support.minZ - EPSILON || z > support.maxZ + EPSILON)
        return null;
    if (Number.isFinite(support.z0) && Number.isFinite(support.z1)) {
        const t = THREE.MathUtils.clamp((z - support.z0) / (support.z1 - support.z0), 0, 1);
        return THREE.MathUtils.lerp(support.y0, support.y1, t);
    }
    return Number.isFinite(support.y) ? support.y : null;
}
/** Highest supporting surface within stepping reach. Returns null over a hole. */
export function groundHeight(position, supports, stepHeight = PLAYER.stepHeight) {
    const p = xyz(position);
    let highest = null;
    for (const support of supports) {
        const y = supportHeight(support, p.x, p.z);
        if (y !== null && y <= p.y + stepHeight + EPSILON && (highest === null || y > highest))
            highest = y;
    }
    return highest;
}
/** Circle against an AABB in XZ, with the player's actual vertical occupancy. */
export function overlapsCollider(position, collider, radius = PLAYER.radius, height = PLAYER.height) {
    if (collider.enabled === false)
        return false;
    const p = xyz(position);
    const min = collider.min;
    const max = collider.max;
    if (p.y + height <= min[1] + EPSILON || p.y >= max[1] - EPSILON)
        return false;
    const x = THREE.MathUtils.clamp(p.x, min[0], max[0]);
    const z = THREE.MathUtils.clamp(p.z, min[2], max[2]);
    return (p.x - x) ** 2 + (p.z - z) ** 2 < radius ** 2 - EPSILON;
}
/** Deterministic sub-stepped movement; sliding along walls preserves player control. */
export function moveWithCollisions(position, delta, colliders, options = {}) {
    const result = xyz(position);
    const radius = options.radius ?? PLAYER.radius;
    const height = options.height ?? PLAYER.height;
    const stepHeight = options.stepHeight ?? PLAYER.stepHeight;
    const steps = Math.max(1, Math.ceil(Math.hypot(delta.x ?? 0, delta.z ?? 0) / (radius * 0.45)));
    const dx = (delta.x ?? 0) / steps;
    const dz = (delta.z ?? 0) / steps;
    for (let i = 0; i < steps; i++) {
        for (const [axis, amount] of [['x', dx], ['z', dz]]) {
            const candidate = {
                ...result, [axis]: result[axis] + amount
            };
            if (options.supports) {
                const ground = groundHeight(candidate, options.supports, stepHeight);
                if (ground !== null && ground > candidate.y)
                    candidate.y = ground;
            }
            if (!colliders.some(collider => overlapsCollider(candidate, collider, radius, height))) {
                result.x = candidate.x;
                result.y = candidate.y;
                result.z = candidate.z;
            }
        }
    }
    return result;
}
export function createController({ camera, domElement, colliders = [], supports = [], onInteract = () => {
}, onMove = () => {
}, onLockChange = () => {
} }) {
    const position = new THREE.Vector3(...ENTRANCES[0].spawn);
    const keys = new Set();
    const listeners = [];
    const direction = new THREE.Vector3();
    let yaw = 0;
    let pitch = 0;
    let enabled = false;
    let dragging = false;
    let velocityY = 0;
    let fallback = false;
    let disposed = false;
    let externalForward = 0;
    let externalRight = 0;
    let externalSprint = false;
    const listen = (target, type, callback, options) => {
        target.addEventListener(type, callback, options);
        listeners.push(() => target.removeEventListener(type, callback, options));
    };
    const syncCamera = () => {
        camera.position.set(position.x, position.y + PLAYER.eyeHeight, position.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    };
    const interact = () => {
        camera.getWorldDirection(direction);
        onInteract({
            position: position.clone(), direction: direction.clone()
        });
    };
    const clearInput = () => {
        keys.clear();
        externalForward = 0;
        externalRight = 0;
        externalSprint = false;
        dragging = false;
    };
    listen(document, 'keydown', event => {
        if (!enabled || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? ''))
            return;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'].includes(event.code))
            event.preventDefault();
        keys.add(event.code);
        if (event.code === 'KeyE' && !event.repeat)
            interact();
        if (event.code === 'Escape' && document.pointerLockElement !== domElement) {
            enabled = false;
            clearInput();
            onLockChange(false);
        }
    });
    listen(document, 'keyup', event => keys.delete(event.code));
    listen(window, 'blur', clearInput);
    listen(document, 'visibilitychange', () => {
        if (document.hidden)
            clearInput();
    });
    listen(document, 'mousemove', event => {
        if (!enabled || (document.pointerLockElement !== domElement && !dragging))
            return;
        yaw -= (event.movementX || 0) * 0.002;
        pitch = THREE.MathUtils.clamp(pitch - (event.movementY || 0) * 0.002, -1.45, 1.45);
        syncCamera();
    });
    listen(domElement, 'mousedown', event => {
        if (!enabled || event.button !== 0)
            return;
        dragging = true;
        domElement.focus({
            preventScroll: true
        });
    });
    listen(window, 'mouseup', () => {
        dragging = false;
    });
    listen(domElement, 'contextmenu', event => event.preventDefault());
    listen(document, 'pointerlockchange', () => {
        const locked = document.pointerLockElement === domElement;
        if (!locked && !fallback) {
            enabled = false;
            clearInput();
        }
        onLockChange(locked);
    });
    listen(document, 'pointerlockerror', () => {
        fallback = true;
        onLockChange(false, {
            fallback: true
        });
    });
    domElement.tabIndex = 0;
    syncCamera();
    return {
        position,
        get yaw() {
            return yaw;
        },
        set yaw(value) {
            yaw = value;
            syncCamera();
        },
        get pitch() {
            return pitch;
        },
        set pitch(value) {
            pitch = THREE.MathUtils.clamp(value, -1.45, 1.45);
            syncCamera();
        },
        get locked() {
            return document.pointerLockElement === domElement;
        },
        get enabled() {
            return enabled;
        },
        get fallback() {
            return fallback;
        },
        setInput({ forward = 0, right = 0, sprint = false } = {}) {
            externalForward = THREE.MathUtils.clamp(forward, -1, 1);
            externalRight = THREE.MathUtils.clamp(right, -1, 1);
            externalSprint = sprint;
        },
        setEnabled(value) {
            enabled = Boolean(value);
            if (!enabled)
                clearInput();
        },
        setPosition(value, nextYaw = yaw, nextPitch = pitch) {
            const p = xyz(value);
            if (![p.x, p.y, p.z, nextYaw, nextPitch].every(Number.isFinite))
                throw new TypeError('Player position and orientation must be finite.');
            position.set(p.x, p.y, p.z);
            yaw = nextYaw;
            pitch = THREE.MathUtils.clamp(nextPitch, -1.45, 1.45);
            velocityY = 0;
            syncCamera();
            onMove(position);
        },
        async lock() {
            enabled = true;
            domElement.focus({
                preventScroll: true
            });
            try {
                if (!domElement.requestPointerLock)
                    throw new Error('Pointer lock unavailable');
                await domElement.requestPointerLock();
            }
            catch {
                fallback = true;
                onLockChange(false, {
                    fallback: true
                });
            }
        },
        interact,
        update(rawDt) {
            if (disposed || !enabled)
                return;
            const dt = Math.min(Math.max(rawDt, 0), 0.05);
            let forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + externalForward;
            let right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + externalRight;
            const length = Math.hypot(forward, right);
            if (length > 1) {
                forward /= length;
                right /= length;
            }
            const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') || externalSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
            const delta = {
                x: (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed * dt,
                z: (-forward * Math.cos(yaw) - right * Math.sin(yaw)) * speed * dt,
            };
            const moved = moveWithCollisions(position, delta, colliders, {
                supports
            });
            position.set(moved.x, moved.y, moved.z);
            const ground = groundHeight(position, supports);
            if (ground !== null && position.y - ground <= 0.4 && velocityY <= 0) {
                position.y = ground;
                velocityY = 0;
            }
            else {
                velocityY = Math.max(-20, velocityY - 18 * dt);
                const nextY = position.y + velocityY * dt;
                if (ground !== null && nextY <= ground) {
                    position.y = ground;
                    velocityY = 0;
                }
                else {
                    const candidate = {
                        x: position.x, y: nextY, z: position.z
                    };
                    if (!colliders.some(collider => overlapsCollider(candidate, collider)))
                        position.y = nextY;
                    else
                        velocityY = 0;
                }
            }
            syncCamera();
            onMove(position);
        },
        dispose() {
            disposed = true;
            enabled = false;
            clearInput();
            for (const remove of listeners)
                remove();
            if (document.pointerLockElement === domElement)
                document.exitPointerLock();
        },
    };
}
