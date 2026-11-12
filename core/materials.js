import * as THREE from '../vendor/three.module.js';

const SIZE = 256;
const GRID = 256;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => value * value * (3 - 2 * value);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function createNoise(seed) {
    const lattice = new Float32Array(GRID * GRID);
    for (let i = 0; i < lattice.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        lattice[i] = (seed >>> 8) / 0x1000000;
    }
    return (u, v, columns, rows = columns) => {
        const x = u * columns;
        const y = v * rows;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const a = (x0 % columns + columns) % columns;
        const b = (y0 % rows + rows) % rows;
        const c = (a + 1) % columns;
        const d = (b + 1) % rows;
        const tx = smooth(x - x0);
        const ty = smooth(y - y0);
        return lerp(lerp(lattice[b * GRID + a], lattice[b * GRID + c], tx),
            lerp(lattice[d * GRID + a], lattice[d * GRID + c], tx), ty);
    };
}

function finishTexture(bytes, colorSpace = THREE.NoColorSpace) {
    const texture = new THREE.DataTexture(bytes, SIZE, SIZE, THREE.RGBAFormat);
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

// Albedo RGB and roughness A share a texture fetch. Relief is authored with the same
// pigment fields, so grout, grain and pores respond to light where they are visible.
function bakeSurface(seed, profile) {
    const noise = createNoise(seed);
    const albedo = new Uint8Array(SIZE * SIZE * 4);
    const normal = new Uint8Array(SIZE * SIZE * 4);
    const height = new Float32Array(SIZE * SIZE);
    const surface = { shade: 0, height: 0, roughness: 0, warmth: 0 };
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE;
        const v = y / SIZE;
        const index = y * SIZE + x;
        profile(u, v, noise, surface);
        albedo[index * 4] = Math.round(clamp(surface.shade + surface.warmth) * 255);
        albedo[index * 4 + 1] = Math.round(clamp(surface.shade) * 255);
        albedo[index * 4 + 2] = Math.round(clamp(surface.shade - surface.warmth) * 255);
        albedo[index * 4 + 3] = Math.round(clamp(surface.roughness) * 255);
        height[index] = surface.height;
    }
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const at = (dx, dy) => height[((y + dy + SIZE) % SIZE) * SIZE + ((x + dx + SIZE) % SIZE)];
        const dx = (at(-1, 0) - at(1, 0)) * 5.4;
        const dy = (at(0, -1) - at(0, 1)) * 5.4;
        const inverseLength = 1 / Math.hypot(dx, dy, 1);
        const index = (y * SIZE + x) * 4;
        normal[index] = Math.round((dx * inverseLength * .5 + .5) * 255);
        normal[index + 1] = Math.round((dy * inverseLength * .5 + .5) * 255);
        normal[index + 2] = Math.round((inverseLength * .5 + .5) * 255);
        normal[index + 3] = 255;
    }
    return {
        albedo: finishTexture(albedo, THREE.SRGBColorSpace),
        normal: finishTexture(normal),
    };
}

const profiles = {
    limestone(u, v, n, out) {
        const beds = n(u, v, 6, 27) * .52 + n(u + .37, v, 19, 71) * .21;
        const mottling = n(u, v, 11) * .63 + n(u, v, 38) * .37;
        const grit = n(u, v, 229, 223);
        const pits = Math.pow(clamp((grit - .73) / .27), 1.6);
        out.shade = .82 + beds * .16 + mottling * .115 - pits * .16;
        out.warmth = (beds - .22) * .035;
        out.height = beds * .13 + mottling * .12 + grit * .024 - pits * .07;
        out.roughness = .86 + mottling * .13;
    },
    plaster(u, v, n, out) {
        const clouds = n(u, v, 8) * .64 + n(u, v, 31) * .36;
        const pinholes = n(u, v, 163, 171);
        out.shade = .89 + clouds * .11 - Math.pow(pinholes, 8) * .08;
        out.warmth = (clouds - .5) * .014;
        out.height = clouds * .08 + pinholes * .032;
        out.roughness = .84 + pinholes * .15;
    },
    marble(u, v, n, out) {
        const cloud = n(u, v, 6) * .58 + n(u, v, 15) * .3 + n(u, v, 36) * .12;
        const distortion = n(u + .27, v, 3, 4) * .36 + n(u, v + .31, 10, 8) * .11;
        const fold = TAU * (u + v + distortion);
        const seams = Math.pow(.5 + Math.sin(fold) * .5, 32);
        const branches = Math.pow(.5 + Math.sin(fold * 2 + cloud * 3.2) * .5, 60);
        const vein = seams * (.14 + cloud * .50) + branches * .08;
        out.shade = .925 + cloud * .075 - vein * .155;
        out.warmth = cloud * .010 + vein * .009;
        // Polished stone has pigment contrast with very little surface relief.
        out.height = cloud * .025 + vein * .008;
        out.roughness = .68 + cloud * .22 + vein * .08;
    },
    floor(u, v, n, out) {
        const patina = n(u, v, 9) * .61 + n(u, v, 61) * .39;
        const edge = Math.min(u, 1 - u, v, 1 - v);
        const joint = 1 - smooth(clamp(edge * 110));
        const dents = Math.pow(n(u, v, 221, 239), 7);
        out.shade = .9 + patina * .1 - joint * .18 - dents * .095;
        out.warmth = patina * .017;
        out.height = patina * .06 - joint * .17 - dents * .025;
        out.roughness = .72 + patina * .16 + joint * .12;
    },
    timber(u, v, n, out) {
        const grain = n(u, v, 128, 4);
        const growth = n(u, v, 11, 3) * .65 + n(u + .29, v, 29, 5) * .35;
        const rings = .5 + .5 * Math.sin(TAU * (u * 9 + growth * 1.35));
        const streak = Math.pow(grain, 4);
        out.shade = .76 + growth * .16 + rings * .10 - streak * .23;
        out.warmth = .025 + rings * .015;
        out.height = rings * .045 + grain * .036 - streak * .028;
        out.roughness = .72 + grain * .24;
    },
    textile(u, v, n, out) {
        const warp = .5 + .5 * Math.cos(TAU * u * 58);
        const weft = .5 + .5 * Math.cos(TAU * v * 58);
        const raised = Math.max(warp, weft) * .78 + Math.min(warp, weft) * .22;
        const pile = n(u, v, 19) * .43 + n(u, v, 193) * .57;
        out.shade = .74 + pile * .17 + raised * .11;
        out.warmth = (pile - .5) * .016;
        out.height = raised * .057 + pile * .031;
        out.roughness = .9 + raised * .09;
    },
    metal(u, v, n, out) {
        const patina = n(u, v, 8) * .52 + n(u, v, 28) * .32 + n(u, v, 97) * .16;
        const lines = n(u, v, 180, 4);
        const scuffs = Math.pow(lines, 9);
        out.shade = .78 + patina * .19 + scuffs * .07;
        out.warmth = (patina - .5) * .03;
        out.height = patina * .055 + lines * .022;
        out.roughness = .59 + patina * .28 + scuffs * .12;
    },
    asphalt(u, v, n, out) {
        const patches = n(u, v, 8) * .45 + n(u, v, 31) * .55;
        const gravel = n(u, v, 119, 121) * .75 + n(u, v, 231, 239) * .25;
        const stone = Math.pow(gravel, 3);
        out.shade = .69 + patches * .20 + stone * .21;
        out.warmth = (patches - .54) * .023;
        out.height = gravel * .115 + stone * .09;
        out.roughness = .8 + gravel * .19;
    },
};

// World-space texture coordinates keep the same grain size on narrow trim, scaled
// walls and instanced slabs. Native Standard shading still handles lights, shadows,
// image-based lighting and tone mapping. Only material sampling is replaced.
function projectSurface(material, texture, textureScale, normalStrength, fixtureUniforms) {
    material.map = texture.albedo;
    material.normalMap = texture.normal;
    material.normalScale.setScalar(normalStrength);
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, fixtureUniforms);
        shader.uniforms.bankTextureScale = { value: new THREE.Vector2(...textureScale) };
        shader.vertexShader = /* glsl */ `
            varying vec3 vBankPosition;
            varying vec3 vBankNormal;
        ` + shader.vertexShader.replace('#include <worldpos_vertex>', /* glsl */ `
            #include <worldpos_vertex>
            vec4 bankPosition = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
                bankPosition = batchingMatrix * bankPosition;
            #endif
            #ifdef USE_INSTANCING
                bankPosition = instanceMatrix * bankPosition;
            #endif
            vBankPosition = (modelMatrix * bankPosition).xyz;
            vBankNormal = transformDirectionByInverseViewMatrix(transformedNormal, viewMatrix);
        `);
        shader.fragmentShader = /* glsl */ `
            varying vec3 vBankPosition;
            varying vec3 vBankNormal;
            uniform vec2 bankTextureScale;
            uniform highp sampler3D bankFixtures;
            uniform vec3 bankFixtureOrigin;
            uniform vec3 bankFixtureScale;
        ` + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
            vec3 bankWeights = pow(abs(normalize(vBankNormal)), vec3(6.0));
            bankWeights *= step(vec3(0.001), bankWeights);
            bankWeights /= bankWeights.x + bankWeights.y + bankWeights.z;
            vec2 bankUvX = vBankPosition.zy * bankTextureScale;
            vec2 bankUvY = vBankPosition.xz * bankTextureScale;
            vec2 bankUvZ = vBankPosition.xy * bankTextureScale;
            vec2 bankDxX = dFdx(bankUvX), bankDyX = dFdy(bankUvX);
            vec2 bankDxY = dFdx(bankUvY), bankDyY = dFdy(bankUvY);
            vec2 bankDxZ = dFdx(bankUvZ), bankDyZ = dFdy(bankUvZ);
            vec4 bankTexel = vec4(0.0);
            vec3 bankNormalOffset = vec3(0.0);
            if (bankWeights.x > 0.0) {
                bankTexel += textureGrad(map, bankUvX, bankDxX, bankDyX) * bankWeights.x;
                vec2 xy = textureGrad(normalMap, bankUvX, bankDxX, bankDyX).xy * 2.0 - 1.0;
                bankNormalOffset += vec3(0.0, xy.y, xy.x) * bankWeights.x;
            }
            if (bankWeights.y > 0.0) {
                bankTexel += textureGrad(map, bankUvY, bankDxY, bankDyY) * bankWeights.y;
                vec2 xy = textureGrad(normalMap, bankUvY, bankDxY, bankDyY).xy * 2.0 - 1.0;
                bankNormalOffset += vec3(xy.x, 0.0, xy.y) * bankWeights.y;
            }
            if (bankWeights.z > 0.0) {
                bankTexel += textureGrad(map, bankUvZ, bankDxZ, bankDyZ) * bankWeights.z;
                vec2 xy = textureGrad(normalMap, bankUvZ, bankDxZ, bankDyZ).xy * 2.0 - 1.0;
                bankNormalOffset += vec3(xy.x, xy.y, 0.0) * bankWeights.z;
            }
            diffuseColor.rgb *= bankTexel.rgb;
        `).replace('#include <roughnessmap_fragment>', /* glsl */ `
            float roughnessFactor = roughness * bankTexel.a;
        `).replace('#include <normal_fragment_maps>', /* glsl */ `
            vec3 bankDetail = (viewMatrix * vec4(bankNormalOffset, 0.0)).xyz;
            bankDetail -= dot(bankDetail, normal) * normal;
            normal = normalize(normal + bankDetail * normalScale.x);
        `).replace('#include <lights_fragment_end>', /* glsl */ `
            #include <lights_fragment_end>
            vec3 fixturePosition = vBankPosition + normalize(vBankNormal) * 0.27;
            vec3 fixtureUv = (fixturePosition - bankFixtureOrigin) * bankFixtureScale;
            vec3 fixtureEdge = min(fixtureUv, 1.0 - fixtureUv);
            float fixtureFade = smoothstep(0.0, 0.035, min(min(fixtureEdge.x, fixtureEdge.y), fixtureEdge.z));
            vec3 fixtureLight = texture(bankFixtures, fixtureUv).rgb * fixtureFade;
            reflectedLight.indirectDiffuse += material.diffuseColor * fixtureLight;
        `);
    };
    material.customProgramCacheKey = () => 'heist-world-space-pbr-v2';
    return material;
}

const bankPalette = {
    concrete: ['#bcb3a1', 'plaster', .91, 0, [.38, .38], .54],
    wall: ['#eae0cf', 'plaster', .86, 0, [.63, .63], .31],
    metal: ['#85817a', 'metal', .57, .69, [1.25, 1.25], .36],
    dark: ['#33312d', 'plaster', .72, .04, [1.1, 1.1], .28],
    floor: ['#ddd3bc', 'floor', .61, 0, [.58, .58], .60],
    paving: ['#d5cbb9', 'floor', .89, 0, [.51, .51], .30],
    wood: ['#906642', 'timber', .57, 0, [1.55, .52], .57],
    brass: ['#d1ae60', 'metal', .43, .8, [1.45, 1.45], .26],
    white: ['#f0ece3', 'plaster', .71, 0, [.86, .86], .22],
    teal: ['#626e61', 'plaster', .81, 0, [.86, .86], .25],
    red: ['#963b3f', 'plaster', .72, 0, [1.8, 1.8], .36],
    blue: ['#587783', 'plaster', .71, 0, [1.5, 1.5], .28],
    fabric: ['#87414a', 'textile', .93, 0, [2.2, 2.2], .50],
    rubber: ['#323333', 'asphalt', .96, 0, [2.4, 2.4], .36],
    limestone: ['#d2c4a8', 'limestone', .85, 0, [.42, .42], .59],
    stoneTrim: ['#e1d4bd', 'limestone', .77, 0, [.53, .53], .38],
    marble: ['#e7e2d8', 'marble', .38, 0, [.31, .31], .20],
    burgundy: ['#80313a', 'textile', .93, 0, [1.65, 1.65], .48],
    bronze: ['#9f8350', 'metal', .56, .76, [1.22, 1.22], .36],
    darkWood: ['#58402e', 'timber', .53, 0, [1.5, .48], .40],
    velvet: ['#993c4d', 'textile', .9, 0, [2.2, 2.2], .50],
    cityBrick: ['#886c55', 'limestone', .94, 0, [.42, .42], .52],
    cityStone: ['#a9a294', 'limestone', .91, 0, [.42, .42], .48],
    asphalt: ['#535454', 'asphalt', .97, 0, [.48, .48], .64],
    stoneDark: ['#6c6860', 'marble', .43, 0, [.34, .34], .21],
    foliage: ['#54664a', 'plaster', .96, 0, [1.55, 1.55], .36],
};

/** Build the bank's material library. All generated texture data is local and deterministic. */
export function createMaterials(fixtureUniforms) {
    const textures = Object.fromEntries(Object.entries(profiles).map(([name, profile], index) => [
        name, bakeSurface(137 + index * 1019, profile),
    ]));
    const materials = Object.fromEntries(Object.entries(bankPalette).map(([name, definition]) => {
        const [color, profile, roughness, metalness, textureScale, normalStrength] = definition;
        const material = new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
        return [name, projectSurface(material, textures[profile], textureScale, normalStrength, fixtureUniforms)];
    }));
    materials.glass = new THREE.MeshStandardMaterial({
        name: 'glass', color: '#94b2b7', transparent: true, opacity: .31, roughness: .12, metalness: .12, depthWrite: false,
    });
    materials.window = new THREE.MeshStandardMaterial({
        name: 'window', color: '#586b73', roughness: .21, metalness: .35,
    });
    materials.light = new THREE.MeshStandardMaterial({
        name: 'light', color: '#f8efda', emissive: '#ffdf9f', emissiveIntensity: 1.25, roughness: .51,
    });
    materials.screen = new THREE.MeshStandardMaterial({
        name: 'screen', color: '#254640', emissive: '#5b9886', emissiveIntensity: .38, roughness: .29,
    });
    materials.painting = new THREE.MeshStandardMaterial({ name: 'painting', color: '#b5b4a1', roughness: .91 });
    if (typeof window !== 'undefined') {
        new THREE.TextureLoader().load(new URL('../assets/harbor-painting.jpg', import.meta.url).href, texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            materials.painting.map = texture;
            materials.painting.color.set('#ffffff');
            materials.painting.needsUpdate = true;
        });
    }
    return materials;
}
