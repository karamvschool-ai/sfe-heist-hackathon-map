import * as THREE from '../vendor/three.module.js';
import { GROUNDS } from './layout.js';

// The city is scenery outside the fixed competition boundary. None of these
// objects carries a detector, access rule, alarm or other team security logic.
const shared = new Map();
const sphere = new THREE.IcosahedronGeometry(1, 1);
const plane = new THREE.PlaneGeometry(1, 1);
const treeMaterials = ['#52634a', '#677252', '#78805a'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .95 }));
const globeMaterial = new THREE.MeshStandardMaterial({ color: '#eee6cf', roughness: .42, emissive: '#d8b875', emissiveIntensity: .16 });

function cached(key, create) {
    if (!shared.has(key)) shared.set(key, create());
    return shared.get(key);
}

function material(kit, name) {
    return kit.materials[name] || kit.materials.concrete;
}

function customMesh(kit, geometry, mat, x, y, z, rotation = 0) {
    const mesh = new THREE.Mesh(geometry, typeof mat === 'string' ? material(kit, mat) : mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.userData.batch = true;
    mesh.receiveShadow = true;
    kit.group.add(mesh);
    return mesh;
}

function extrudeShape(shape, depth = .2) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
    geometry.computeVertexNormals();
    return geometry;
}

const WINDOW = {
    radius: 1.25,
    sill: .85,
    spring: 2.45,
    arcSegments: 32,
    jambDepth: .3,
};

function outlineArch(radius, begin, end, segments) {
    return Array.from({ length: segments + 1 }, (_, index) => {
        const angle = begin + (end - begin) * index / segments;
        return [radius * Math.cos(angle), WINDOW.spring + radius * Math.sin(angle)];
    });
}

function polygon(points) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    return shape;
}

function archedPane() {
    return cached('bank-pane', () => new THREE.ShapeGeometry(polygon([
        [-WINDOW.radius, WINDOW.sill],
        [WINDOW.radius, WINDOW.sill],
        ...outlineArch(WINDOW.radius, 0, Math.PI, WINDOW.arcSegments),
    ])));
}

function archBand(start, end, inner, outer, depth, segments = 8) {
    return extrudeShape(polygon([
        ...outlineArch(outer, start, end, segments),
        ...outlineArch(inner, end, start, segments),
    ]), depth);
}

/** Fill a 2.5 m × 2.85 m shell opening. Local +Z faces out of the bank. */
export function addArchedWindow(kit, x, floorY, z, rotation = 0) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const local = (across, height, outward) => [
        x + across * cos + outward * sin,
        floorY + height,
        z - across * sin + outward * cos,
    ];
    const box = (across, height, outward, width, rise, depth, finish) =>
        kit.box(...local(across, height, outward), width, rise, depth, finish, { rotationY: rotation });
    const glass = cached('bank-window-glass', () => {
        const pane = material(kit, 'glass').clone();
        pane.color.set('#a0b4ad');
        pane.opacity = .43;
        pane.side = THREE.DoubleSide;
        return pane;
    });
    customMesh(kit, archedPane(), glass, ...local(0, 0, 0), rotation);

    // Share the same arc samples as the pane so each stone infill closes its corner.
    const { radius, sill, spring, arcSegments, jambDepth } = WINDOW;
    for (const side of [-1, 1]) {
        const infill = cached(`bank-window-infill-${side}`, () => {
            const corner = side > 0
                ? outlineArch(radius, Math.PI / 2, 0, arcSegments / 2)
                : outlineArch(radius, Math.PI / 2, Math.PI, arcSegments / 2);
            return extrudeShape(polygon([
                [side * radius, spring],
                [side * radius, spring + radius],
                ...corner.slice(0, -1),
            ]), jambDepth);
        });
        customMesh(kit, infill, 'limestone', ...local(0, 0, -jambDepth / 2), rotation);
    }

    // The projecting stone surround and inset bronze sash sit on different depths.
    const sash = cached('bank-window-sash', () => archBand(0, Math.PI, 1.174, 1.27, .17, arcSegments));
    customMesh(kit, sash, 'bronze', ...local(0, 0, -.085), rotation);
    for (let i = 0; i < 9; i++) {
        const start = i * Math.PI / 9 + .008;
        const end = (i + 1) * Math.PI / 9 - .008;
        const stone = cached(`bank-window-stone-${i}`, () => archBand(start, end, 1.32, 1.49, .155));
        customMesh(kit, stone, i === 4 ? 'stoneTrim' : 'limestone', ...local(0, 0, .151), rotation);
    }
    const jambY = (sill + spring) / 2;
    for (const side of [-1, 1]) {
        box(side * 1.405, jambY, .2285, .17, spring - sill, .155, 'stoneTrim');
        box(side * 1.222, jambY + .004, 0, .096, spring - sill - .008, .17, 'bronze');
    }
    box(0, sill - .074, .16, 3.15, .146, .46, 'stoneTrim');
    box(0, sill + .036, .005, 2.348, .068, .16, 'bronze');
    box(0, spring, .004, 2.348, .058, .162, 'bronze');

    const midY = 1.63;
    box(0, midY, 0, 2.348, .05, .105, 'bronze');
    for (const across of [-.582, 0, .582]) {
        for (const [base, top] of [[sill + .07, midY - .025], [midY + .025, spring - .029]]) {
            box(across, (base + top) / 2, 0, .05, top - base, .105, 'bronze');
        }
    }
    for (const angle of [Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI * 2 / 3, Math.PI * 5 / 6]) {
        const start = .118;
        const end = 1.174;
        const center = (start + end) / 2;
        const bar = box(Math.cos(angle) * center, spring + Math.sin(angle) * center, 0, end - start, .045, .105, 'bronze');
        bar.rotation.order = 'YXZ';
        bar.rotation.z = angle;
    }
    box(0, spring + .075, .006, .161, .113, .174, 'bronze');
}

function classicalColumn(kit, x, z) {
    // Turned bands and the single fluted shaft have adjacent caps and no shared surfaces.
    const shaft = cached('bank-column', () => {
        const geometry = new THREE.CylinderGeometry(.35, .43, 6.62, 128, 1, true);
        const positions = geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
            const x = positions.getX(index), z = positions.getZ(index);
            const radius = Math.hypot(x, z);
            const angle = Math.atan2(x, z);
            const flute = .018 * (.5 - .5 * Math.cos(16 * angle));
            positions.setX(index, x * (radius - flute) / radius);
            positions.setZ(index, z * (radius - flute) / radius);
        }
        geometry.computeVertexNormals();
        return geometry;
    });
    kit.box(x, .09, z, 1.26, .18, 1.26, 'limestone');
    kit.cylinder(x, .245, z, .565, .13, 'stoneTrim');
    kit.cylinder(x, .385, z, .493, .15, 'limestone');
    kit.cylinder(x, .51, z, .465, .10, 'stoneTrim');
    customMesh(kit, shaft, 'stoneTrim', x, 3.87, z);
    kit.cylinder(x, 7.27, z, .419, .18, 'limestone');
    kit.cylinder(x, 7.46, z, .497, .20, 'stoneTrim');
    kit.cylinder(x, 7.66, z, .551, .20, 'limestone');
    kit.box(x, 7.93, z, 1.24, .34, 1.24, 'stoneTrim');
    kit.box(x, 8.185, z, 1.39, .17, 1.39, 'limestone');
    kit.addCollider(`bank-portico-column-${x}`, x, 3.98, z, 1.0, 7.96, 1.0);
    kit.addCollider(`bank-portico-plinth-${x}`, x, .09, z, 1.26, .18, 1.26);
}

function pilaster(kit, x, z, rotation = 0) {
    kit.box(x, .2485, z, .93, .491, .39, 'limestone', { rotationY: rotation });
    kit.box(x + .017 * Math.sin(rotation), 4.36, z + .017 * Math.cos(rotation), .69, 7.76, .3, 'stoneTrim', { rotationY: rotation });
    kit.box(x, 8.39, z, .92, .30, .38, 'limestone', { rotationY: rotation });
}

function carvedInscription(kit, text, y, z, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 93px Georgia, serif';
    ctx.fillStyle = '#e5d1a8';
    ctx.fillText(text, 770, 67, 1440);
    ctx.fillStyle = '#4c3522';
    ctx.fillText(text, 768, 64, 1440);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const lettering = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const mesh = customMesh(kit, plane, lettering, 0, y, z);
    mesh.scale.set(width, height, 1);
}

export function decorateBankExterior(kit) {
    for (const y of [0, 4.4]) {
        for (const x of [-22.3, -17.1, -5.8, 5.8, 17.1, 22.3]) {
            addArchedWindow(kit, x, y, 19);
            addArchedWindow(kit, x, y, -19, Math.PI);
        }
        for (const side of [-1, 1]) for (const z of [-14, -7, 7, 14]) {
            addArchedWindow(kit, side * 26, y, z, side * Math.PI / 2);
        }
    }

    // The masonry trim begins outside the shell and leaves every door clear.
    for (const [y, height, depth, finish] of [
        [4.31, .18, .29, 'stoneTrim'],
        [8.46, .20, .29, 'stoneTrim'],
        [8.67, .22, .41, 'limestone'],
        [8.85, .14, .56, 'stoneTrim'],
    ]) {
        for (const side of [-1, 1]) {
            kit.box(0, y, side * (19.15 + depth / 2), 52.3 + depth * 2, height, depth, finish);
            kit.box(side * (26.15 + depth / 2), y, 0, depth, height, 38.3, finish);
        }
    }
    for (const side of [-1, 1]) {
        for (const x of [14.1, 19.7, 25.15]) {
            pilaster(kit, x * side, 19.29);
            pilaster(kit, x * side, -19.29, Math.PI);
        }
        for (const z of [-17.6, -10.5, 10.5, 17.6]) pilaster(kit, side * 26.29, z, side * Math.PI / 2);
        for (const [min, max] of [[-19.15, -1.86], [1.86, 19.15]]) {
            kit.box(side * 26.28, .243, (min + max) / 2, .26, .474, max - min, 'stoneTrim');
        }
        const approachWidth = 26.15 - 2.45;
        kit.box(side * (2.45 + approachWidth / 2), .243, 19.28, approachWidth, .474, .26, 'stoneTrim');
        kit.box(side * 2.41, 1.6, 19.211, .22, 3.2, .11, 'stoneTrim');
        kit.box(side * 26.211, 1.6, -1.79, .11, 3.2, .22, 'stoneTrim');
        kit.box(side * 26.211, 1.6, 1.79, .11, 3.2, .22, 'stoneTrim');
        kit.box(side * 26.205, 3.345, 0, .11, .29, 3.8, 'stoneTrim');
    }
    kit.box(0, 3.345, 19.205, 5.04, .29, .11, 'stoneTrim');
    kit.box(0, .243, -19.28, 52.3, .474, .26, 'stoneTrim');

    // Six mirrored columns carry a portico with a clear 4.4 m public opening.
    for (const x of [-9.8, -6.8, -3.4, 3.4, 6.8, 9.8]) classicalColumn(kit, x, 21.1);
    kit.box(0, 8.46, 20.77, 21.65, .38, 3.36, 'limestone');
    kit.box(0, 8.73, 20.8, 22, .16, 3.5, 'stoneTrim');
    kit.box(0, 9.17, 20.8, 21.58, .72, 3.18, 'limestone');
    kit.box(0, 9.60, 20.8, 22.03, .14, 3.5, 'stoneTrim');
    kit.box(0, 9.78, 20.8, 22.43, .22, 3.74, 'limestone');
    kit.box(0, 9.96, 20.8, 22.61, .14, 3.88, 'stoneTrim');
    for (let x = -10; x <= 10; x += .8) kit.box(x, 8.565, 22.515, .23, .16, .13, 'stoneTrim');
    kit.box(0, 9.19, 22.455, 17.8, .57, .13, 'stoneTrim');
    carvedInscription(kit, 'FOUNDRY NATIONAL BANK', 9.19, 22.526, 17.5, .51);
}

function tree(kit, x, z, variant = 0) {
    kit.box(x, .03, z, 4.2, .06, 4.2, 'stoneDark');
    kit.box(x, .065, z, 3.7, .035, 3.7, 'foliage');
    kit.cylinder(x, 2.5, z, .18, 5, 'darkWood');
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + variant;
        const mesh = customMesh(kit, sphere, treeMaterials[(i + variant) % 3], x + Math.cos(a) * 1.15, 5.1 + (i % 2) * .9, z + Math.sin(a) * 1.15);
        mesh.scale.set(2.1, 1.7, 2.1);
    }
    kit.addCollider(`city-tree-${x}-${z}`, x, 2, z, .6, 4, .6);
}

function streetLamp(kit, x, z, double = true) {
    kit.cylinder(x, .3, z, .3, .6, 'bronze');
    kit.cylinder(x, 3.2, z, .095, 5.8, 'bronze');
    kit.cylinder(x, 5.8, z, .18, .3, 'bronze');
    const arms = double ? [-1, 1] : [0];
    if (double) kit.box(x, 5.9, z, 2.5, .12, .12, 'bronze');
    for (const side of arms) {
        kit.cylinder(x + side * 1.12, 6.16, z, .2, .4, 'bronze');
        const bulb = customMesh(kit, sphere, globeMaterial, x + side * 1.12, 6.55, z);
        bulb.scale.set(.32, .48, .32);
        kit.cylinder(x + side * 1.12, 6.99, z, .085, .12, 'bronze');
    }
    if (Math.abs(x) < 105 && Math.abs(z) < 85) {
        kit.addCollider(`city-lamp-base-${x}-${z}`, x, .3, z, .6, .6, .6);
        kit.addCollider(`city-lamp-pole-${x}-${z}`, x, 3.2, z, .23, 5.8, .23);
    }
}

function bench(kit, x, z, rotation = 0) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const box = (lx, y, lz, w, h, d, mat) => kit.box(x + lx * c + lz * s, y, z - lx * s + lz * c, w, h, d, mat, { rotationY: rotation });
    for (let i = 0; i < 5; i++) box(0, .5, -.3 + i * .15, 3.3, .08, .1, 'darkWood');
    for (let i = 0; i < 3; i++) box(0, .77 + i * .18, -.42, 3.3, .12, .08, 'darkWood');
    for (const side of [-1, 1]) {
        box(side * 1.2, .24, 0, .14, .48, .85, 'bronze');
        box(side * 1.5, .77, 0, .1, .13, .85, 'bronze');
    }
    if (Math.abs(x) < 105 && Math.abs(z) < 85) {
        const width = Math.abs(c) * 3.4 + Math.abs(s);
        const depth = Math.abs(s) * 3.4 + Math.abs(c);
        kit.addCollider(`city-bench-${x}-${z}`, x, .6, z, width, 1.2, depth);
    }
}

function car(kit, x, z, color, heading = 0, id = '') {
    const c = Math.cos(heading), s = Math.sin(heading);
    const position = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const box = (lx, y, lz, w, h, d, mat) => kit.box(...position(lx, y, lz), w, h, d, mat, { rotationY: heading });
    box(0, .6, 0, 1.85, .55, 4.45, color);
    box(0, 1.41, -.15, 1.62, .09, 1.86, color);
    box(0, 1.13, -.15, 1.59, .49, 1.85, 'window');
    for (const pillar of [-1.04, -.18, .75]) box(0, 1.14, pillar, 1.64, .55, .105, color);
    box(0, .43, 2.21, 1.9, .13, .12, 'metal');
    box(0, .43, -2.21, 1.9, .13, .12, 'metal');
    for (const side of [-1, 1]) {
        box(side * .62, .69, 2.24, .42, .2, .06, 'white');
        box(side * .62, .69, -2.24, .4, .16, .06, 'burgundy');
        for (const dz of [-1.42, 1.42]) {
            const wheel = kit.cylinder(...position(side * .96, .35, dz), .35, .2, 'rubber');
            wheel.rotation.z = Math.PI / 2;
            wheel.rotation.y = heading;
            const hub = kit.cylinder(...position(side * 1.065, .35, dz), .19, .018, 'metal');
            hub.rotation.z = Math.PI / 2;
            hub.rotation.y = heading;
        }
    }
    if (Math.abs(x) < 102 && Math.abs(z) < 82) kit.addCollider(`city-car-${id || `${x}-${z}`}`, x, .8, z, Math.abs(c) > .5 ? 2 : 4.6, 1.6, Math.abs(c) > .5 ? 4.6 : 2);
}

function facadeTexture(kind, seed) {
    const key = `city-facade-${kind}-${seed % 3}`;
    return cached(key, () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const backgrounds = { brick: '#8e6c54', red: '#785346', pale: '#a79f88', stone: '#8c938e', glass: '#4d6366' };
        ctx.fillStyle = backgrounds[kind] || backgrounds.stone;
        ctx.fillRect(0, 0, 256, 256);
        if (kind !== 'glass') {
            ctx.fillStyle = '#1d201b22';
            for (let row = 0; row < 20; row++) {
                ctx.fillRect(0, row * 13, 256, 1);
                for (let col = 0; col < 7; col++) ctx.fillRect(col * 42 + (row % 2) * 21, row * 13, 1, 13);
            }
        }
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) {
                const x = 13 + col * 85, y = 12 + row * 128;
                ctx.fillStyle = kind === 'glass' ? '#253e45' : '#b1ada0';
                ctx.fillRect(x - 3, y - 3, 61, 100);
                ctx.fillStyle = (row * 3 + col + seed) % 7 === 0 ? '#a4a18a' : '#36474a';
                ctx.fillRect(x, y, 55, 91);
                ctx.fillStyle = '#152b3140';
                ctx.fillRect(x + 2, y + 2, 25, 87);
                ctx.fillStyle = '#c2c0a555';
                ctx.fillRect(x + 29, y + 3, 23, 22 + ((col + seed) % 3) * 13);
                ctx.fillStyle = '#101c22';
                ctx.fillRect(x + 26, y, 3, 91);
                ctx.fillRect(x, y + 45, 55, 3);
                if (kind !== 'glass') {
                    ctx.fillStyle = '#c9c1a9';
                    ctx.fillRect(x - 5, y + 94, 65, 4);
                }
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        return texture;
    });
}

function cityBuilding(kit, definition, index) {
    const { x, z, w, d, h, kind = 'stone', face = 0 } = definition;
    const wallMat = kind === 'brick' || kind === 'red' ? 'cityBrick' : 'cityStone';
    kit.box(x, (h + 4.1) / 2, z, w, h - 4.1, d, wallMat);
    const texture = facadeTexture(kind, index).clone();
    texture.needsUpdate = true;
    texture.repeat.set(w / 10, (h - 4.2) / 8.4);
    const facade = new THREE.MeshStandardMaterial({ map: texture, roughness: kind === 'glass' ? .38 : .86, metalness: kind === 'glass' ? .25 : .02 });
    // At skyline distances a thin coplanar offset is below depth-buffer precision.
    const facadeOffset = .24;
    for (const [dx, dz, width, angle] of [[0, d / 2 + facadeOffset, w, 0], [0, -d / 2 - facadeOffset, w, Math.PI], [w / 2 + facadeOffset, 0, d, Math.PI / 2], [-w / 2 - facadeOffset, 0, d, -Math.PI / 2]]) {
        const mesh = customMesh(kit, plane, facade, x + dx, (h + 4.2) / 2, z + dz, angle);
        mesh.scale.set(width, h - 4.2, 1);
    }
    kit.box(x, 2.05, z, w + .12, 4.1, d + .12, 'stoneDark');
    kit.box(x, 4.2, z, w + .55, .3, d + .55, 'stoneTrim');
    kit.box(x, h + .2, z, w + .8, .4, d + .8, kind === 'glass' ? 'metal' : 'stoneTrim');
    kit.box(x, h + .55, z, w + .3, .3, d + .3, 'stoneDark');
    for (const side of [-1, 1]) {
        kit.box(x + side * (w / 2 - .07), (h + 4.32) / 2, z + d / 2 + .12, .35, h - 4.08, .28, 'stoneTrim');
    }
    const frontZ = face === Math.PI ? -d / 2 - .15 : face === 0 ? d / 2 + .15 : 0;
    const frontX = face === Math.PI / 2 ? w / 2 + .15 : face === -Math.PI / 2 ? -w / 2 - .15 : 0;
    const storefrontWidth = frontX ? d : w;
    const horizontal = frontX === 0;
    for (let n = 0; n < Math.floor(storefrontWidth / 7); n++) {
        const offset = -storefrontWidth / 2 + 3.5 + n * 7;
        const px = x + frontX + (horizontal ? offset : 0), pz = z + frontZ + (horizontal ? 0 : offset);
        const glass = kit.box(px, 1.8, pz, horizontal ? 5.8 : .08, 2.8, horizontal ? .08 : 5.8, 'window');
        glass.userData.batch = true;
        kit.box(px, 3.43, pz, horizontal ? 6.3 : .18, .22, horizontal ? .18 : 6.3, 'bronze');
    }
    const names = ['CIVIC BOOKS', 'METRO COFFEE', 'WATERSTONE HOTEL', 'CITY PHARMACY', 'UNION BUILDING', 'THE CORNER DELI', 'CENTRAL OFFICES'];
    const signWidth = Math.min(storefrontWidth - 2, 19);
    const normalX = Math.sin(face), normalZ = Math.cos(face);
    const signX = x + frontX + normalX * .06;
    const signZ = z + frontZ + normalZ * .06;
    // Mount the plaque between the shop headers and the continuous cornice.
    // Its back reaches the masonry while the lettering sits clear of the frame.
    kit.box(signX - normalX * .08, 3.79, signZ - normalZ * .08, signWidth + .3, .49, .19, 'darkWood', { rotationY: face });
    kit.label(names[index % names.length], signX + normalX * .036, 3.79, signZ + normalZ * .036, {
        width: signWidth, height: .4, rotation: face,
        color: '#e2d5b8', background: '#303c36', fontSize: 64, serif: true,
    });
    // Roof water tanks, elevator overruns and setbacks silhouette the skyline.
    if (index % 3 === 0) {
        kit.box(x + w * .22, h + 2.2, z - d * .12, w * .32, 3.3, d * .3, 'stoneDark');
        kit.cylinder(x - w * .18, h + 2.4, z + d * .15, 2.1, 3.2, 'darkWood');
        for (const side of [-1, 1]) kit.box(x - w * .18 + side * 1.7, h + .992, z + d * .15, .15, 1.2, 2.7, 'metal');
    } else kit.box(x, h + 1.2, z, 5, 1.2, 4, 'metal');
    if (kind !== 'glass') {
        for (let y = 10; y < h - 1; y += 10) kit.box(x, y, z + d / 2 + .15, w + .25, .18, .35, 'stoneTrim');
    }
}

function closure(kit, x, z, width, rotation = 0, sign = false) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const box = (lx, y, lz, w, h, d, mat) => kit.box(x + lx * c + lz * s, y, z - lx * s + lz * c, w, h, d, mat, { rotationY: rotation });
    box(0, .15, 0, width, .3, 1.05, 'concrete');
    box(0, .57, 0, width - .15, .58, .62, 'stoneTrim');
    box(0, .95, 0, width - .25, .18, .43, 'limestone');
    for (const side of [-1, 1]) for (let n = -Math.floor(width / 2.3); n <= Math.floor(width / 2.3); n++) {
        const along = n * 1.06;
        const face = side * .32;
        const stripe = customMesh(kit, plane, n % 2 ? 'white' : 'burgundy',
            x + along * c + face * s, .59, z - along * s + face * c, rotation + (side < 0 ? Math.PI : 0));
        stripe.scale.set(.36, .43, 1);
        stripe.rotation.z = -.3 * side;
    }
    if (sign) {
        for (const side of [-1, 1]) box(side * 1.75, 1.55, 0, .07, 1.5, .07, 'metal');
        box(0, 2.05, 0, 4.5, .85, .12, 'stoneDark');
        for (const side of [-1, 1]) {
            kit.label('STREET CLOSED', x + s * side * .08, 2.08, z + c * side * .08, {
                width: 4.15, height: .48, rotation: rotation + (side < 0 ? Math.PI : 0),
                color: '#e2d8bb', background: '#343b33', fontSize: 70,
            });
        }
    }
}

export function buildCity(kit) {
    // The bank and playable streets have their own slabs and open stair shafts.
    const { minX, maxX, minZ, maxZ } = GROUNDS;
    for (const [left, right, north, south] of [
        [-135, minX, -115, 115], [maxX, 135, -115, 115],
        [minX, maxX, -115, minZ], [minX, maxX, maxZ, 115],
    ]) {
        kit.box((left + right) / 2, -.16, (north + south) / 2, right - left, .32, south - north, 'asphalt');
    }
    function surface(minX, maxX, minZ, maxZ) {
        kit.box((minX + maxX) / 2, .019, (minZ + maxZ) / 2, maxX - minX, .034, maxZ - minZ, 'paving');
    }
    // Four adjoining walkways form the playable block. The slabs do not overlap.
    surface(-33, 33, 18.98, 25.5);
    surface(-33, 33, -25.5, -18.98);
    for (const side of [-1, 1]) {
        surface(side < 0 ? -33 : 25.98, side < 0 ? -25.98 : 33, -18.98, 18.98);
        for (const z of [-14, 11]) streetLamp(kit, side * 29.7, z, false);
        streetLamp(kit, side * 12.8, 24.2, true);
        bench(kit, side * 18.1, 23, 0);
        for (const z of [-22.4, 23]) tree(kit, side * 23.1, z);
        car(kit, side * 36.2, -8.5, side < 0 ? 'metal' : 'burgundy');
        for (const z of [-15, 0, 15]) kit.box(side * 36.2, .007, z, .10, .012, 2.6, 'white');
    }
    for (let x = -36; x <= 36; x += 8) {
        closure(kit, x, 31.525, 8, 0, x === -4);
        closure(kit, x, -31.525, 8, 0, x === -4);
    }
    for (let i = 0; i < 8; i++) {
        const z = -31 + (i + .5) * (62 / 8);
        for (const side of [-1, 1]) closure(kit, side * 40.525, z, 62 / 8, Math.PI / 2, i === 3);
    }
    for (const x of [-40.525, 40.525]) for (const z of [-31.525, 31.525]) {
        kit.box(x, .49, z, 1.04, .98, 1.04, 'stoneTrim');
    }
    for (const [index, x] of [-51, -32, -13, 13, 32, 51].entries()) {
        const band = Math.min(index, 5 - index);
        cityBuilding(kit, { x, z: -48, w: 16, d: 14, h: [34, 25, 30][band],
            kind: ['stone', 'red', 'pale'][band], face: 0 }, index);
        cityBuilding(kit, { x, z: 49, w: 16, d: 15, h: [29, 22, 26][band],
            kind: ['glass', 'brick', 'stone'][band], face: Math.PI }, index + 6);
    }
    for (const side of [-1, 1]) for (const [index, z] of [-25, -5, 15, 32.4].entries()) {
        cityBuilding(kit, { x: side * 58, z, w: 14, d: 15, h: [28, 22, 32, 24][index],
            kind: ['brick', 'pale', 'glass', 'red'][index], face: -side * Math.PI / 2 }, index + 12);
    }
    for (const side of [-1, 1]) {
        for (const z of [-29, 29]) {
            for (let i = 0; i < 6; i++) kit.box(side * 35.8, .007, z + (i - 2.5) * .54, 5.4, .012, .28, 'white');
        }
    }
}
