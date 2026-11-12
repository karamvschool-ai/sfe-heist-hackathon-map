import * as THREE from '../vendor/three.module.js';

const daylight = new THREE.Color('#fff3dc');
const sky = new THREE.Color('#adc2d4');

// Prefilter broad sky and interior sources for rough reflections in stone, glass and metal.
function reflectionProbe(renderer) {
    const width = 128;
    const height = 64;
    const pixels = new Float32Array(width * height * 4);
    const north = new THREE.Vector3(-.45, .76, .47).normalize();
    const direction = new THREE.Vector3();
    for (let y = 0; y < height; y++) {
        const polar = Math.PI * (y + .5) / height;
        for (let x = 0; x < width; x++) {
            const azimuth = 2 * Math.PI * (x + .5) / width;
            direction.set(-Math.cos(azimuth) * Math.sin(polar), Math.cos(polar), Math.sin(azimuth) * Math.sin(polar));
            const upward = Math.max(0, direction.y);
            const panel = Math.pow(Math.max(0, direction.dot(north)), 55);
            const side = Math.pow(Math.max(0, direction.x * .92 + direction.y * .38), 18);
            const light = .11 + upward * .46 + panel * 3.7 + side * .31;
            const offset = (y * width + x) * 4;
            pixels[offset] = light * .91;
            pixels[offset + 1] = light * .96;
            pixels[offset + 2] = light * 1.02;
            pixels[offset + 3] = 1;
        }
    }
    const input = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
    input.mapping = THREE.EquirectangularReflectionMapping;
    input.colorSpace = THREE.LinearSRGBColorSpace;
    input.needsUpdate = true;
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromEquirectangular(input);
    generator.dispose();
    input.dispose();
    return target;
}

export function createLighting(scene, renderer) {
    const hemisphere = new THREE.HemisphereLight(sky, '#75634e', .95);
    const sun = new THREE.DirectionalLight(daylight, 3.2);
    sun.position.set(-74, 102, 85);
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    Object.assign(sun.shadow.camera, { left: -49, right: 49, top: 49, bottom: -49, near: 58, far: 225 });
    sun.shadow.bias = -.00017;
    sun.shadow.normalBias = .045;
    sun.shadow.radius = 2;
    scene.add(hemisphere, sun);
    const skyGeometry = new THREE.SphereGeometry(400, 28, 14);
    const skyMaterial = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { sunDirection: { value: sun.position.clone().normalize() } },
        vertexShader: `
            varying vec3 skyDirection;
            void main() {
                skyDirection = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 skyDirection;
            uniform vec3 sunDirection;
            void main() {
                vec3 direction = normalize(skyDirection);
                float height = max(direction.y, 0.0);
                vec3 color = mix(vec3(0.63, 0.70, 0.76), vec3(0.18, 0.35, 0.56), pow(height, 0.60));
                float glare = pow(max(dot(direction, sunDirection), 0.0), 22.0);
                color += glare * vec3(0.30, 0.24, 0.17);
                gl_FragColor = vec4(color, 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `
    });
    const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    skyDome.renderOrder = 1000;
    skyDome.frustumCulled = false;
    skyDome.raycast = () => {};
    scene.add(skyDome);

    const probe = renderer.extensions.has('EXT_color_buffer_float') ? reflectionProbe(renderer) : null;
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = probe?.texture ?? null;
    scene.environmentIntensity = .44;
    return {
        update(cameraPosition) {
            skyDome.position.copy(cameraPosition);
        },
        dispose() {
            if (scene.environment === (probe?.texture ?? null)) {
                scene.environment = previousEnvironment;
                scene.environmentIntensity = previousIntensity;
            }
            probe?.dispose();
            scene.remove(hemisphere, sun);
            sun.shadow.dispose();
            skyDome.removeFromParent();
            skyGeometry.dispose();
            skyMaterial.dispose();
        }
    };
}

// Resolve shaded HDR color with depth-aware contact occlusion. The world-space
// sample radius keeps the shadows under props when the player moves closer.
export function createLightingPass(renderer, camera) {
    const supported = renderer.extensions.has('EXT_color_buffer_float');
    const gl = renderer.getContext();
    const supportedSamples = supported ? gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) : [];
    const samples = supportedSamples.includes(4) ? 4 : supportedSamples.includes(2) ? 2 : 0;
    let enabled = supported;
    const target = supported ? new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
        samples,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
    }) : null;
    const uniforms = {
        colorBuffer: { value: target?.texture },
        depthBuffer: { value: target?.depthTexture },
        inverseProjection: { value: camera.projectionMatrixInverse },
        projectionScale: { value: new THREE.Vector2() },
        pixel: { value: new THREE.Vector2(1, 1) }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: `
            varying vec2 sampleUV;
            void main() {
                sampleUV = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 sampleUV;
            uniform sampler2D colorBuffer;
            uniform sampler2D depthBuffer;
            uniform mat4 inverseProjection;
            uniform vec2 projectionScale;
            uniform vec2 pixel;

            vec3 viewPosition(vec2 uv, float depth) {
                vec4 point = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                return point.xyz / point.w;
            }

            void main() {
                vec3 color = texture2D(colorBuffer, sampleUV).rgb;
                float depth = texture2D(depthBuffer, sampleUV).r;
                if (depth < 0.999995) {
                    vec3 center = viewPosition(sampleUV, depth);
                    vec3 normal = normalize(cross(dFdx(center), dFdy(center)));
                    vec2 radius = min(projectionScale * (0.82 / -center.z), 31.0 * pixel);
                    float occlusion = 0.0;
                    for (int index = 0; index < 12; ++index) {
                        float angle = float(index) * 2.399963;
                        float ring = index < 6 ? 0.48 : 1.0;
                        vec2 uv = sampleUV + vec2(cos(angle), sin(angle)) * radius * ring;
                        if (any(lessThan(uv, pixel)) || any(greaterThan(uv, 1.0 - pixel))) continue;
                        vec3 offset = viewPosition(uv, texture2D(depthBuffer, uv).r) - center;
                        float distance = length(offset);
                        float rise = dot(offset, normal) - 0.045;
                        occlusion += clamp(rise / max(distance, 0.05), 0.0, 1.0) * (1.0 - smoothstep(0.28, 1.05, distance));
                    }
                    color *= 1.0 - min(0.32, occlusion * 0.075);
                }
                gl_FragColor = vec4(color, 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const screen = new THREE.Scene();
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    screen.add(quad);
    const screenCamera = new THREE.Camera();
    const size = new THREE.Vector2();
    return {
        get active() { return enabled; },
        setEnabled(value) { enabled = supported && value; },
        resize() {
            if (!target) return;
            renderer.getDrawingBufferSize(size);
            target.setSize(size.x, size.y);
            uniforms.pixel.value.set(1 / size.x, 1 / size.y);
        },
        render(scene) {
            if (!enabled) {
                renderer.render(scene, camera);
                return;
            }
            const projection = camera.projectionMatrix.elements;
            uniforms.projectionScale.value.set(projection[0] * .5, projection[5] * .5);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            renderer.render(screen, screenCamera);
        },
        dispose() {
            target?.dispose();
            geometry.dispose();
            material.dispose();
        }
    };
}
