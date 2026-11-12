// Furnishing coordinates are measured from a room center, with positive Z
// pointing away from its doorway. This keeps a consistent clear aisle in both wings.
function roomKit(room, kit, door) {
    const [cx, cy, cz] = room.center;
    const inward = door?.axis === 'z'
        ? Math.sign(cx - door.position[0])
        : door ? Math.sign(cz - door.position[2]) : 1;
    const yaw = door?.axis === 'z' ? inward * Math.PI / 2 : inward < 0 ? Math.PI : 0;
    const c = Math.round(Math.cos(yaw));
    const s = Math.round(Math.sin(yaw));
    const [minX, , minZ] = room.bounds.min;
    const [maxX, , maxZ] = room.bounds.max;
    const across = s ? maxZ - minZ : maxX - minX;
    const depth = s ? maxX - minX : maxZ - minZ;
    let serial = 0;
    const position = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const box = (x, y, z, w, h, d, material, rotation = 0) =>
        kit.box(...position(x, y, z), w, h, d, material, { rotationY: yaw + rotation });
    const cylinder = (x, y, z, radius, height, material) =>
        kit.cylinder(...position(x, y, z), radius, height, material);
    function collider(x, y, z, w, h, d, rotation = 0) {
        const angle = yaw + rotation;
        const a = Math.abs(Math.cos(angle));
        const b = Math.abs(Math.sin(angle));
        kit.addCollider(`${room.id}-prop-${serial++}`, ...position(x, y, z), w * a + d * b, h, w * b + d * a);
    }
    return { across, depth, box, cylinder, collider };
}

function chair(t, x, z, yaw = 0) {
    const c = Math.round(Math.cos(yaw));
    const s = Math.round(Math.sin(yaw));
    const part = (a, y, b, w, h, d, mat) => t.box(x + a * c + b * s, y, z - a * s + b * c, w, h, d, mat, yaw);
    for (const dx of [-.225, .225]) for (const dz of [-.218, .218]) part(dx, .23, dz, .065, .46, .065, 'darkWood');
    part(0, .49, 0, .56, .06, .54, 'darkWood');
    part(0, .55, -.027, .53, .06, .45, 'velvet');
    for (const side of [-1, 1]) part(side * .245, .77, .244, .065, .5, .07, 'darkWood');
    part(0, .817, .244, .425, .28, .055, 'velvet');
    part(0, 1.025, .244, .55, .06, .075, 'darkWood');
    t.collider(x, .53, z, .56, 1.06, .57, yaw);
}

function desk(t, x, z, width = 1.85) {
    const depth = .81;
    const top = .78;
    t.box(x, top - .034, z, width, .068, depth, 'wood');
    for (const side of [-1, 1]) {
        const baseX = x + side * (width * .5 - .235);
        t.box(baseX, .356, z, .4, .712, .73, 'darkWood');
        for (let i = 0; i < 3; i++) {
            const y = .185 + i * .18;
            t.box(baseX, y, z + .374, .34, .14, .018, 'wood');
            t.box(baseX, y, z + .394, .13, .018, .024, 'brass');
        }
    }
    t.collider(x, .39, z, width, .78, depth);
    t.box(x, top + .009, z + .045, .59, .018, .39, 'foliage');
    t.box(x - .13, top + .024, z + .058, .237, .012, .306, 'white');
    t.box(x + .105, top + .023, z + .052, .014, .01, .205, 'brass');
    const lampX = x - width * .34;
    const lampZ = z - .19;
    t.cylinder(lampX, top + .023, lampZ, .121, .046, 'bronze');
    t.cylinder(lampX, top + .181, lampZ, .025, .27, 'bronze');
    t.box(lampX, top + .347, lampZ, .32, .089, .162, 'foliage');
    t.box(lampX, top + .298, lampZ, .264, .018, .119, 'light');
    chair(t, x, z + .84);
}

function shelving(t, x, z, width, cargo = 'ledgers') {
    const depth = .47;
    const height = cargo === 'deposit' ? 1.94 : 2.16;
    t.box(x, (height + .06) * .5, z + .215, width - .12, height - .18, .04, 'darkWood');
    for (const side of [-1, 1]) t.box(x + side * (width * .5 - .03), height * .5, z, .06, height, depth, 'darkWood');
    t.box(x, .06, z, width - .12, .12, depth, 'darkWood');
    t.box(x, height - .03, z, width - .12, .06, depth, 'darkWood');
    const tiers = 4;
    const innerWidth = width - .12;
    for (let tier = 0; tier < tiers; tier++) {
        const top = .175 + tier * (height - .24) / tiers;
        t.box(x, top - .022, z - .018, innerWidth, .044, .435, 'wood');
        const items = cargo === 'ledgers' ? Math.max(4, Math.floor(innerWidth / .17)) : 4;
        const step = innerWidth / items;
        for (let i = 0; i < items; i++) {
            const bookX = x - innerWidth * .5 + (i + .5) * step;
            const itemHeight = cargo === 'ledgers' ? .24 + (i % 3) * .034 : .229;
            const itemColor = cargo === 'ledgers' ? ['burgundy', 'foliage', 'stoneDark', 'wood'][i % 4]
                : cargo === 'deposit' ? 'metal' : 'stoneTrim';
            t.box(bookX, top + itemHeight * .5, z + .004, step * .83, itemHeight, .321, itemColor);
            t.box(bookX, top + .09, z - .166, step * .57, .029, .02, cargo === 'deposit' ? 'brass' : 'bronze');
        }
    }
    t.collider(x, height * .5, z, width, height, depth);
}

function bench(t, x, z, width = 1.83, yaw = 0) {
    const c = Math.round(Math.cos(yaw));
    const s = Math.round(Math.sin(yaw));
    const part = (a, y, b, w, h, d, mat) => t.box(x + a * c + b * s, y, z - a * s + b * c, w, h, d, mat, yaw);
    for (const a of [-width * .39, width * .39]) for (const b of [-.265, .265]) part(a, .145, b, .08, .29, .08, 'darkWood');
    part(0, .345, 0, width, .11, .71, 'darkWood');
    part(0, .468, -.036, width - .14, .136, .56, 'burgundy');
    part(0, .704, .301, width, .608, .095, 'darkWood');
    part(0, .792, .235, width - .17, .327, .037, 'velvet');
    for (const side of [-1, 1]) {
        part(side * (width * .5 - .05), .625, -.03, .085, .07, .52, 'wood');
        part(side * (width * .5 - .05), .5, -.235, .07, .18, .07, 'darkWood');
    }
    t.collider(x, .504, z, width, 1.008, .71, yaw);
}

function table(t, x, z, width, length, marble = false) {
    const top = marble ? .51 : .75;
    for (const dx of [-width * .4, width * .4]) for (const dz of [-length * .4, length * .4]) {
        t.box(x + dx, (top - .065) * .5, z + dz, .076, top - .065, .076, 'darkWood');
    }
    t.box(x, top - .033, z, width, .066, length, marble ? 'marble' : 'wood');
    t.collider(x, top * .5, z, width, top, length);
    return top;
}

function plant(t, x, z) {
    t.cylinder(x, .035, z, .23, .07, 'bronze');
    t.cylinder(x, .205, z, .225, .27, 'bronze');
    t.cylinder(x, .354, z, .24, .028, 'brass');
    t.cylinder(x, .374, z, .21, .012, 'stoneDark');
    t.cylinder(x, .802, z, .035, .846, 'darkWood');
    for (let i = 0; i < 6; i++) {
        const angle = i * 2.399;
        const leaf = t.box(x + Math.cos(angle) * .125, .84 + (i % 3) * .14, z + Math.sin(angle) * .125,
            .17, .4, .045, 'foliage', angle);
        leaf.rotation.z = Math.sin(angle) * .4;
        leaf.rotation.x = Math.cos(angle) * .4;
    }
    t.collider(x, .18, z, .48, .36, .48);
}

function serverRack(t, x, z) {
    const height = 1.93;
    t.box(x, .045, z, .625, .09, .58, 'metal');
    t.box(x, (height + .09) * .5, z + .043, .58, height - .09, .48, 'dark');
    for (const side of [-1, 1]) t.box(x + side * .274, (height + .09) * .5, z - .224, .037, height - .09, .055, 'metal');
    for (let slot = 0; slot < 8; slot++) {
        const y = .22 + slot * .197;
        t.box(x, y, z - .22, .505, .163, .072, 'metal');
        for (let slit = 0; slit < 4; slit++) t.box(x - .15, y - .041 + slit * .027, z - .26, .13, .013, .013, 'dark');
        t.box(x + .167, y, z - .265, .035, .014, .017, 'screen');
    }
    t.collider(x, height * .5, z, .625, height, .58);
}

function plantRoom(t) {
    const x = t.across * .5 - 1.03;
    for (const side of [-1, 1]) {
        const cx = side * x;
        t.box(cx, .065, 1, 1.2, .13, 1.9, 'concrete');
        t.box(cx, .77, 1, 1.06, 1.28, 1.74, 'metal');
        for (let louver = 0; louver < 6; louver++) t.box(cx, .39 + louver * .14, .12, .75, .045, .04, 'dark');
        t.cylinder(cx, 1.443, 1.45, .154, .066, 'bronze');
        t.cylinder(cx, 1.601, 1.45, .079, .25, 'metal');
        t.collider(cx, .705, 1, 1.2, 1.41, 1.9);
    }
}

function restroom(t) {
    const x = t.across * .5 - 1.03;
    const z = t.depth * .5 - .7;
    for (const side of [-1, 1]) {
        const cx = side * x;
        t.box(cx, .429, z, .85, .858, .51, 'darkWood');
        t.box(cx, .888, z, .89, .06, .53, 'marble');
        t.box(cx, .957, z - .065, .48, .079, .31, 'white');
        t.cylinder(cx, .979, z + .123, .023, .122, 'bronze');
        t.box(cx, 1.052, z + .09, .056, .028, .09, 'brass');
        t.collider(cx, .5, z, .89, 1, .53);
    }
}

/** Populate a room after the wall openings are defined. No art or plaques are
 * attached here: only the wall builder places signs in audited wall sections. */
export function furnishBankRoom(room, kit, door) {
    if (room.kind === 'stairs' || room.kind === 'stair') return;
    if (room.kind === 'lobby') {
        decorateBankHall(room, kit);
        return;
    }
    const t = roomKit(room, kit, door);
    const sideX = t.across * .5 - 1.22;
    const rear = t.depth * .5 - .63;
    const twoShelves = (cargo = 'ledgers') => {
        const width = Math.min(2.05, sideX * .9);
        for (const side of [-1, 1]) shelving(t, side * sideX, rear, width, cargo);
    };
    switch (room.kind) {
        case 'vault':
            twoShelves('deposit');
            for (const x of [-sideX, sideX]) shelving(t, x, 1.6, 1.68, 'deposit');
            break;
        case 'archive':
        case 'records':
            twoShelves();
            for (const x of [-sideX, sideX]) shelving(t, x, .7, 1.75, 'ledgers');
            break;
        case 'storage':
        case 'loading':
            twoShelves('boxes');
            for (const x of [-sideX, sideX]) shelving(t, x, .3, 1.75, 'boxes');
            break;
        case 'server':
        case 'network':
            for (const x of [-sideX, sideX]) for (const z of [-.25, .68, 1.61]) serverRack(t, x, z);
            break;
        case 'mechanical':
        case 'generator':
        case 'electrical':
        case 'workshop':
        case 'utility':
            plantRoom(t);
            break;
        case 'restroom':
            restroom(t);
            break;
        case 'conference': {
            const width = 1.19;
            const x = Math.min(sideX, 2.58);
            const length = Math.min(3, t.depth - 3.1);
            const top = table(t, -x, .7, width, length);
            for (const z of [-.025, 1.375]) {
                chair(t, -x + .95, z, Math.PI / 2);
                t.box(-x, top + .009, z, .34, .018, .255, 'white');
            }
            shelving(t, sideX, rear, 1.82);
            plant(t, sideX, -.75);
            break;
        }
        case 'lounge':
        case 'break':
        case 'cafeteria':
            for (const side of [-1, 1]) {
                bench(t, side * sideX, rear, 1.86);
                table(t, side * sideX, rear - 1.15, 1.04, .52, true);
            }
            // The vault antechamber shares its north wall with the records entrance.
            plant(t, room.id === 'B1-antechamber' ? sideX : -sideX, .1);
            break;
        case 'reception':
            desk(t, -sideX, rear - 1.65, 1.92);
            bench(t, sideX, rear, 1.92);
            table(t, sideX, rear - 1.18, 1.12, .56, true);
            break;
        case 'executive':
        case 'office':
        case 'control':
        default:
            desk(t, -sideX, rear - 1.68, room.kind === 'executive' ? 2.08 : 1.88);
            shelving(t, sideX, rear, 1.94);
            plant(t, room.id === 'B1-guard-station' ? -sideX : sideX, -.35);
            break;
    }
}

function hallColumn(t, x, z) {
    t.box(x, .055, z, .79, .11, .79, 'stoneDark');
    t.cylinder(x, .177, z, .352, .135, 'marble');
    t.cylinder(x, .272, z, .299, .055, 'bronze');
    t.cylinder(x, 4.32, z, .261, 8.04, 'marble');
    t.cylinder(x, 8.382, z, .311, .084, 'bronze');
    t.cylinder(x, 8.484, z, .354, .12, 'marble');
    t.box(x, 8.633, z, .79, .178, .79, 'stoneTrim');
    t.collider(x, .055, z, .79, .11, .79);
    t.collider(x, 4.239, z, .62, 8.258, .62);
}

function pendant(t, x, z) {
    const shadeBottom = 5.71;
    const shadeTop = 6.27;
    t.cylinder(x, 8.657, z, .17, .086, 'bronze');
    t.cylinder(x, (8.614 + shadeTop) * .5, z, .022, 8.614 - shadeTop, 'bronze');
    t.box(x, shadeTop - .04, z, .73, .08, .73, 'bronze');
    t.box(x, shadeBottom + .04, z, .73, .08, .73, 'bronze');
    t.box(x, 5.99, z, .47, .365, .47, 'light');
    for (const dx of [-.333, .333]) for (const dz of [-.333, .333]) {
        t.box(x + dx, 5.99, z + dz, .057, .4, .057, 'bronze');
    }
    for (const side of [-1, 1]) {
        t.box(x + side * .332, 5.99, z, .016, .399, .609, 'glass');
        t.box(x, 5.99, z + side * .332, .609, .399, .016, 'glass');
    }
}

function teller(t, side, z) {
    const x = side * 8.79;
    const front = x - side * .585;
    t.box(x, .055, z, 1.285, .11, 4.03, 'stoneDark');
    t.box(x, .545, z, 1.17, .87, 3.96, 'darkWood');
    t.box(x, 1.038, z, 1.32, .116, 4.06, 'marble');
    for (let i = 0; i < 4; i++) {
        const panelZ = z + (i - 1.5) * .93;
        t.box(front - side * .019, .542, panelZ, .038, .6, .79, 'wood');
        t.box(front - side * .042, .822, panelZ, .021, .017, .71, 'brass');
    }
    const frameX = x + side * .18;
    for (const offset of [-1.865, 0, 1.865]) t.box(frameX, 1.573, z + offset, .105, .955, .092, 'darkWood');
    t.box(frameX, 2.094, z, .14, .087, 3.822, 'darkWood');
    for (const offset of [-.928, .928]) {
        t.box(frameX, 1.987, z + offset, .058, .037, 1.77, 'brass');
        for (const rail of [-.67, -.335, 0, .335, .67]) {
            t.box(frameX, 1.898, z + offset + rail, .026, .142, .026, 'bronze');
        }
        t.box(front + side * .263, 1.108, z + offset, .36, .024, .508, 'foliage');
        t.box(front + side * .249, 1.127, z + offset - .022, .242, .014, .299, 'white');
    }
    t.collider(x, .549, z, 1.32, 1.098, 4.06);
    t.collider(frameX, 1.642, z, .14, 1.087, 3.822);
}

/** Mirror the lobby furnishings and keep x = ±6.5 clear of every prop. */
export function decorateBankHall(room, kit) {
    const t = roomKit(room, kit);
    const localZ = absoluteZ => absoluteZ - room.center[2];
    for (const side of [-1, 1]) {
        for (const z of [6.15, 12.3, 16.65]) hallColumn(t, side * 7.72, localZ(z));
        for (const z of [7.65, 14.9]) {
            pendant(t, side * 3.65, localZ(z));
            kit.fixture(side * 3.65, 5.85, z, { range: 11, strength: 16 });
        }
        teller(t, side, localZ(9.38));
        bench(t, side * 9.02, localZ(15.12), 1.82, side * Math.PI / 2);
        plant(t, side * 9.25, localZ(17.68));
    }
}
