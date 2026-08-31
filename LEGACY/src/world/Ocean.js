import * as THREE from "three";

export class Ocean {
    constructor(scene, {
        size = 2400,
        seaLevel = 0,
        segments = 220
    } = {}) {
        this.scene = scene;
        this.time = 0;

        this.geometry = new THREE.PlaneGeometry(
            size,
            size,
            segments,
            segments
        );

        this.geometry.rotateX(-Math.PI / 2);

        this.material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,

            uniforms: {
                uTime: {value: 0},

                uDeepColor: {
                    value: new THREE.Color(0x17485b)
                },

                uShallowColor: {
                    value: new THREE.Color(0x3f91a7)
                },

                uHighlightColor: {
                    value: new THREE.Color(0xb6d8dc)
                },

                uOpacity: {
                    value: 0.86
                }
            },

            vertexShader: `
                uniform float uTime;

                varying vec3 vWorldPosition;
                varying vec3 vNormalWorld;
                varying float vWave;

                const float PI = 3.141592653589793;

                vec2 waveDirection(float angle) {
                    return vec2(cos(angle), sin(angle));
                }

                void main() {
                    vec3 p = position;

                    vec2 d1 = waveDirection(0.35);
                    vec2 d2 = waveDirection(1.75);
                    vec2 d3 = waveDirection(2.65);

                    float phase1 =
                        dot(p.xz, d1) * 0.055 +
                        uTime * 1.15;

                    float phase2 =
                        dot(p.xz, d2) * 0.085 +
                        uTime * 0.82;

                    float phase3 =
                        dot(p.xz, d3) * 0.145 +
                        uTime * 1.45;

                    float a1 = 0.22;
                    float a2 = 0.12;
                    float a3 = 0.055;

                    float wave1 = sin(phase1) * a1;
                    float wave2 = sin(phase2) * a2;
                    float wave3 = sin(phase3) * a3;

                    float wave =
                        wave1 +
                        wave2 +
                        wave3;

                    p.y += wave;

                    float dx =
                        cos(phase1) * a1 * 0.055 * d1.x +
                        cos(phase2) * a2 * 0.085 * d2.x +
                        cos(phase3) * a3 * 0.145 * d3.x;

                    float dz =
                        cos(phase1) * a1 * 0.055 * d1.y +
                        cos(phase2) * a2 * 0.085 * d2.y +
                        cos(phase3) * a3 * 0.145 * d3.y;

                    vec3 localNormal = normalize(
                        vec3(-dx, 1.0, -dz)
                    );

                    vec4 worldPosition =
                        modelMatrix *
                        vec4(p, 1.0);

                    vWorldPosition = worldPosition.xyz;

                    vNormalWorld = normalize(
                        mat3(modelMatrix) *
                        localNormal
                    );

                    vWave = wave;

                    gl_Position =
                        projectionMatrix *
                        viewMatrix *
                        worldPosition;
                }
            `,

            fragmentShader: `
                uniform vec3 uDeepColor;
                uniform vec3 uShallowColor;
                uniform vec3 uHighlightColor;
                uniform float uOpacity;

                varying vec3 vWorldPosition;
                varying vec3 vNormalWorld;
                varying float vWave;

                void main() {
                    vec3 normal = normalize(vNormalWorld);

                    vec3 viewDirection = normalize(
                        cameraPosition -
                        vWorldPosition
                    );

                    float fresnel =
                        pow(
                            1.0 -
                            max(
                                dot(normal, viewDirection),
                                0.0
                            ),
                            3.0
                        );

                    float waveMix =
                        clamp(
                            vWave * 1.5 + 0.5,
                            0.0,
                            1.0
                        );

                    vec3 waterColor = mix(
                        uDeepColor,
                        uShallowColor,
                        waveMix * 0.35
                    );

                    waterColor = mix(
                        waterColor,
                        uHighlightColor,
                        fresnel * 0.45
                    );

                    float specular =
                        pow(
                            max(
                                dot(
                                    reflect(
                                        -normalize(
                                            vec3(0.45, 1.0, 0.30)
                                        ),
                                        normal
                                    ),
                                    viewDirection
                                ),
                                0.0
                            ),
                            32.0
                        );

                    waterColor +=
                        vec3(specular * 0.22);

                    gl_FragColor =
                        vec4(
                            waterColor,
                            uOpacity
                        );
                }
            `
        });

        this.mesh = new THREE.Mesh(
            this.geometry,
            this.material
        );

        this.mesh.name = "Ocean";
        this.mesh.position.y = seaLevel;
        this.mesh.frustumCulled = false;

        scene.add(this.mesh);
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.material.uniforms.uTime.value = this.time;
    }

    setVisible(visible) {
        this.mesh.visible = visible;
    }

    dispose() {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}