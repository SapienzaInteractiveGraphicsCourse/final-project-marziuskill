import * as THREE from "three";
import {EXRLoader} from "three/addons/loaders/EXRLoader.js";

const BASE_PATH = "./assets/textures/terrain/";

const PATHS = {
    sandDiffuse: `${BASE_PATH}sand/sand_01_diff_2k.jpg`,
    sandNormal: `${BASE_PATH}sand/sand_01_nor_gl_2k.exr`,
    sandRoughness: `${BASE_PATH}sand/sand_01_rough_2k.jpg`,

    grassDiffuse: `${BASE_PATH}grass/leafy_grass_diff_2k.jpg`,
    grassNormal: `${BASE_PATH}grass/leafy_grass_nor_gl_2k.exr`,
    grassRoughness: `${BASE_PATH}grass/leafy_grass_rough_2k.exr`,

    forestDiffuse: `${BASE_PATH}forest/forest_leaves_02_diffuse_2k.jpg`,
    forestNormal: `${BASE_PATH}forest/forest_leaves_02_nor_gl_2k.exr`,
    forestRoughness: `${BASE_PATH}forest/forest_leaves_02_rough_2k.jpg`,

    cliffDiffuse: `${BASE_PATH}cliff/rock_3_diff_2k.jpg`,
    cliffNormal: `${BASE_PATH}cliff/rock_3_nor_gl_2k.exr`,
    cliffRoughness: `${BASE_PATH}cliff/rock_3_rough_2k.jpg`
};

function makeFallbackTexture(value = 255) {
    const data = new Uint8Array([value, value, value, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
}

function makeFallbackNormal() {
    const data = new Uint8Array([128, 128, 255, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function configureTexture(texture, colorSpace) {
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

function loadTexture(path, colorSpace, onLoad) {
    new THREE.TextureLoader().load(
        path,
        texture => {
            configureTexture(texture, colorSpace);
            onLoad(texture);
        },
        undefined,
        error => console.error(`Terrain texture failed: ${path}`, error)
    );
}

function loadEXR(path, onLoad) {
    new EXRLoader().load(
        path,
        texture => {
            configureTexture(texture, THREE.NoColorSpace);
            onLoad(texture);
        },
        undefined,
        error => console.error(`Terrain EXR failed: ${path}`, error)
    );
}

const textures = {
    sandDiffuse: makeFallbackTexture(),
    sandNormal: makeFallbackNormal(),
    sandRoughness: makeFallbackTexture(),

    grassDiffuse: makeFallbackTexture(),
    grassNormal: makeFallbackNormal(),
    grassRoughness: makeFallbackTexture(),

    forestDiffuse: makeFallbackTexture(),
    forestNormal: makeFallbackNormal(),
    forestRoughness: makeFallbackTexture(),

    cliffDiffuse: makeFallbackTexture(),
    cliffNormal: makeFallbackNormal(),
    cliffRoughness: makeFallbackTexture()
};

const UNIFORM_NAMES = {
    sandDiffuse: "uSandDiffuse",
    sandNormal: "uSandNormal",
    sandRoughness: "uSandRoughness",

    grassDiffuse: "uGrassDiffuse",
    grassNormal: "uGrassNormal",
    grassRoughness: "uGrassRoughness",

    forestDiffuse: "uForestDiffuse",
    forestNormal: "uForestNormal",
    forestRoughness: "uForestRoughness",

    cliffDiffuse: "uCliffDiffuse",
    cliffNormal: "uCliffNormal",
    cliffRoughness: "uCliffRoughness"
};

let material = null;
let texturesStarted = false;

function updateShaderTexture(name, texture) {
    textures[name] = texture;

    const shader = material?.userData.terrainShader;
    if (!shader) return;

    shader.uniforms[UNIFORM_NAMES[name]].value = texture;
}

function startTextureLoading() {
    if (texturesStarted) return;
    texturesStarted = true;

    loadTexture(PATHS.sandDiffuse, THREE.SRGBColorSpace,
        texture => updateShaderTexture("sandDiffuse", texture));
    loadEXR(PATHS.sandNormal,
        texture => updateShaderTexture("sandNormal", texture));
    loadTexture(PATHS.sandRoughness, THREE.NoColorSpace,
        texture => updateShaderTexture("sandRoughness", texture));

    loadTexture(PATHS.grassDiffuse, THREE.SRGBColorSpace,
        texture => updateShaderTexture("grassDiffuse", texture));
    loadEXR(PATHS.grassNormal,
        texture => updateShaderTexture("grassNormal", texture));
    loadEXR(PATHS.grassRoughness,
        texture => updateShaderTexture("grassRoughness", texture));

    loadTexture(PATHS.forestDiffuse, THREE.SRGBColorSpace,
        texture => updateShaderTexture("forestDiffuse", texture));
    loadEXR(PATHS.forestNormal,
        texture => updateShaderTexture("forestNormal", texture));
    loadTexture(PATHS.forestRoughness, THREE.NoColorSpace,
        texture => updateShaderTexture("forestRoughness", texture));

    loadTexture(PATHS.cliffDiffuse, THREE.SRGBColorSpace,
        texture => updateShaderTexture("cliffDiffuse", texture));
    loadEXR(PATHS.cliffNormal,
        texture => updateShaderTexture("cliffNormal", texture));
    loadTexture(PATHS.cliffRoughness, THREE.NoColorSpace,
        texture => updateShaderTexture("cliffRoughness", texture));
}

export function getTerrainMaterial() {
    if (material) return material;

    material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        metalness: 0
    });

    material.onBeforeCompile = shader => {
        shader.uniforms.uSandDiffuse = {value: textures.sandDiffuse};
        shader.uniforms.uSandNormal = {value: textures.sandNormal};
        shader.uniforms.uSandRoughness = {value: textures.sandRoughness};

        shader.uniforms.uGrassDiffuse = {value: textures.grassDiffuse};
        shader.uniforms.uGrassNormal = {value: textures.grassNormal};
        shader.uniforms.uGrassRoughness = {value: textures.grassRoughness};

        shader.uniforms.uForestDiffuse = {value: textures.forestDiffuse};
        shader.uniforms.uForestNormal = {value: textures.forestNormal};
        shader.uniforms.uForestRoughness = {value: textures.forestRoughness};

        shader.uniforms.uCliffDiffuse = {value: textures.cliffDiffuse};
        shader.uniforms.uCliffNormal = {value: textures.cliffNormal};
        shader.uniforms.uCliffRoughness = {value: textures.cliffRoughness};

        shader.uniforms.uSeaLevel = {value: 0};
        shader.uniforms.uMaxHeight = {value: 100};
        shader.uniforms.uIslandCenter = {value: new THREE.Vector2()};
        shader.uniforms.uIslandRadius = {value: new THREE.Vector2(1, 1)};

        shader.uniforms.uSandScale = {value: 0.24};
        shader.uniforms.uGrassScale = {value: 0.18};
        shader.uniforms.uForestScale = {value: 0.20};
        shader.uniforms.uCliffScale = {value: 0.13};

        shader.vertexShader = `
            varying vec3 vTerrainWorldPos;
            varying vec3 vTerrainWorldNormal;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
            #include <begin_vertex>

            vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
            `
        );

        shader.fragmentShader = `
            uniform sampler2D uSandDiffuse;
            uniform sampler2D uSandNormal;
            uniform sampler2D uSandRoughness;

            uniform sampler2D uGrassDiffuse;
            uniform sampler2D uGrassNormal;
            uniform sampler2D uGrassRoughness;

            uniform sampler2D uForestDiffuse;
            uniform sampler2D uForestNormal;
            uniform sampler2D uForestRoughness;

            uniform sampler2D uCliffDiffuse;
            uniform sampler2D uCliffNormal;
            uniform sampler2D uCliffRoughness;

            uniform float uSeaLevel;
            uniform float uMaxHeight;

            uniform vec2 uIslandCenter;
            uniform vec2 uIslandRadius;

            uniform float uSandScale;
            uniform float uGrassScale;
            uniform float uForestScale;
            uniform float uCliffScale;

            varying vec3 vTerrainWorldPos;
            varying vec3 vTerrainWorldNormal;

            vec3 terrainTriplanarWeights(vec3 normal) {
                vec3 weights = pow(abs(normal), vec3(5.0));
                return weights / max(weights.x + weights.y + weights.z, 0.0001);
            }

            vec4 terrainTriplanar(
                sampler2D tex,
                vec3 worldPos,
                vec3 normal,
                float scale
            ) {
                vec3 weights = terrainTriplanarWeights(normal);

                vec4 xSample = texture2D(tex, worldPos.zy * scale);
                vec4 ySample = texture2D(tex, worldPos.xz * scale);
                vec4 zSample = texture2D(tex, worldPos.xy * scale);

                return
                    xSample * weights.x +
                    ySample * weights.y +
                    zSample * weights.z;
            }

            /*
             * Normal mapping triplanare.
             *
             * Ogni normal map viene proiettata lungo X/Y/Z,
             * trasformata nello spazio world e infine miscelata.
             */
            vec3 terrainTriplanarNormal(
                sampler2D tex,
                vec3 worldPos,
                vec3 worldNormal,
                float scale
            ) {
                vec3 weights = terrainTriplanarWeights(worldNormal);

                vec3 nX = texture2D(tex, worldPos.zy * scale).xyz * 2.0 - 1.0;
                vec3 nY = texture2D(tex, worldPos.xz * scale).xyz * 2.0 - 1.0;
                vec3 nZ = texture2D(tex, worldPos.xy * scale).xyz * 2.0 - 1.0;

                float sx = worldNormal.x < 0.0 ? -1.0 : 1.0;
                float sy = worldNormal.y < 0.0 ? -1.0 : 1.0;
                float sz = worldNormal.z < 0.0 ? -1.0 : 1.0;

                vec3 worldX = normalize(vec3(
                    sx * nX.z,
                    -sx * nX.y,
                    nX.x
                ));

                vec3 worldY = normalize(vec3(
                    nY.x,
                    sy * nY.z,
                    -sy * nY.y
                ));

                vec3 worldZ = normalize(vec3(
                    nZ.x,
                    sz * nZ.y,
                    sz * nZ.z
                ));

                return normalize(
                    worldX * weights.x +
                    worldY * weights.y +
                    worldZ * weights.z
                );
            }

            float terrainMacroNoise(vec3 worldPos) {
                float a =
                    sin(worldPos.x * 0.037) *
                    sin(worldPos.z * 0.043);

                float b =
                    sin(
                        worldPos.x * 0.019 +
                        worldPos.z * 0.031
                    );

                float c =
                    sin(
                        worldPos.x * 0.071 -
                        worldPos.z * 0.053
                    );

                return
                    a * 0.45 +
                    b * 0.35 +
                    c * 0.20;
            }

            /*
             * x = sand
             * y = grass
             * z = forest
             * w = cliff
             */
            vec4 terrainBlendWeights(
                vec3 worldPos,
                vec3 worldNormal
            ) {
                float height =
                    max(worldPos.y - uSeaLevel, 0.0);

                float normalY =
                    clamp(abs(worldNormal.y), 0.0, 1.0);

                vec2 radialPosition =
                    (worldPos.xz - uIslandCenter) /
                    max(uIslandRadius, vec2(0.001));

                float radius = length(radialPosition);
                float macroNoise = terrainMacroNoise(worldPos);

                float adjustedHeight =
                    height +
                    macroNoise * 1.5;

                /*
                 * SPIAGGIA
                 */
                float sandHeight =
                    1.0 -
                    smoothstep(
                        1.0,
                        5.5,
                        adjustedHeight
                    );

                float sandFlat =
                    smoothstep(
                        0.72,
                        0.92,
                        normalY
                    );

                float sand =
                    sandHeight *
                    sandFlat;

                /*
                 * CLIFF:
                 * Rock 3 solo sulle pendenze forti.
                 */
                float cliff =
                    1.0 -
                    smoothstep(
                        0.64,
                        0.84,
                        normalY
                    );

                float cliffHeightBoost =
                    smoothstep(
                        uMaxHeight * 0.18,
                        uMaxHeight * 0.55,
                        adjustedHeight
                    );

                cliff *= mix(
                    0.82,
                    1.0,
                    cliffHeightBoost
                );

                /*
                 * INTERNO ISOLA.
                 */
                float interior =
                    1.0 -
                    smoothstep(
                        0.58,
                        0.90,
                        radius
                    );

                /*
                 * Forest floor normale.
                 */
                float forestHeight =
                    1.0 -
                    smoothstep(
                        uMaxHeight * 0.60,
                        uMaxHeight * 0.84,
                        adjustedHeight
                    );

                float forestSlope =
                    smoothstep(
                        0.72,
                        0.90,
                        normalY
                    );

                float forest =
                    interior *
                    forestHeight *
                    forestSlope;

                forest *=
                    clamp(
                        0.90 +
                        macroNoise * 0.20,
                        0.65,
                        1.15
                    );

                /*
                 * Ex "highland":
                 *
                 * ora NON usa più rocky_terrain.
                 * Le zone alte ma piatte vengono ricoperte
                 * dalla stessa Forest Leaves dell'interno.
                 */
                float highForestHeight =
                    smoothstep(
                        uMaxHeight * 0.50,
                        uMaxHeight * 0.70,
                        adjustedHeight
                    );

                float highForestFlat =
                    smoothstep(
                        0.82,
                        0.95,
                        normalY
                    );

                float highForest =
                    highForestHeight *
                    highForestFlat;

                forest +=
                    highForest * 0.90;

                /*
                 * LEAFY GRASS:
                 * radure e fascia esterna.
                 */
                float lowMidHeight =
                    1.0 -
                    smoothstep(
                        uMaxHeight * 0.48,
                        uMaxHeight * 0.70,
                        adjustedHeight
                    );

                float grassFlat =
                    smoothstep(
                        0.74,
                        0.90,
                        normalY
                    );

                float outerZone =
                    smoothstep(
                        0.40,
                        0.82,
                        radius
                    );

                float grass =
                    lowMidHeight *
                    grassFlat *
                    (
                        0.42 +
                        outerZone * 0.58
                    );

                /*
                 * Sabbia e cliff hanno priorità.
                 */
                float reserved =
                    clamp(
                        sand +
                        cliff,
                        0.0,
                        1.0
                    );

                forest *=
                    1.0 - reserved;

                grass *=
                    1.0 - reserved;

                /*
                 * Nell'interno Forest Leaves deve dominare.
                 */
                grass *=
                    1.0 -
                    interior * 0.72;

                forest *=
                    0.70 +
                    interior * 0.55;

                vec4 weights =
                    vec4(
                        sand,
                        grass,
                        forest,
                        cliff
                    );

                float total =
                    weights.x +
                    weights.y +
                    weights.z +
                    weights.w;

                if (total < 0.0001) {
                    weights.z = 1.0;
                    total = 1.0;
                }

                return weights / total;
            }
        ` + shader.fragmentShader;

        /*
         * DIFFUSE
         */
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            `
            vec3 terrainNormal =
                normalize(vTerrainWorldNormal);

            vec4 terrainWeights =
                terrainBlendWeights(
                    vTerrainWorldPos,
                    terrainNormal
                );

            vec3 sandColor =
                terrainTriplanar(
                    uSandDiffuse,
                    vTerrainWorldPos,
                    terrainNormal,
                    uSandScale
                ).rgb;

            vec3 grassColor =
                terrainTriplanar(
                    uGrassDiffuse,
                    vTerrainWorldPos,
                    terrainNormal,
                    uGrassScale
                ).rgb;

            vec3 forestColor =
                terrainTriplanar(
                    uForestDiffuse,
                    vTerrainWorldPos,
                    terrainNormal,
                    uForestScale
                ).rgb;

            vec3 cliffColor =
                terrainTriplanar(
                    uCliffDiffuse,
                    vTerrainWorldPos,
                    terrainNormal,
                    uCliffScale
                ).rgb;

            vec3 terrainColor =
                sandColor * terrainWeights.x +
                grassColor * terrainWeights.y +
                forestColor * terrainWeights.z +
                cliffColor * terrainWeights.w;

            diffuseColor.rgb *= terrainColor;
            `
        );

        /*
         * ROUGHNESS
         */
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            `
            vec3 terrainRoughNormal =
                normalize(vTerrainWorldNormal);

            vec4 terrainRoughWeights =
                terrainBlendWeights(
                    vTerrainWorldPos,
                    terrainRoughNormal
                );

            float sandRoughness =
                terrainTriplanar(
                    uSandRoughness,
                    vTerrainWorldPos,
                    terrainRoughNormal,
                    uSandScale
                ).r;

            float grassRoughness =
                terrainTriplanar(
                    uGrassRoughness,
                    vTerrainWorldPos,
                    terrainRoughNormal,
                    uGrassScale
                ).r;

            float forestRoughness =
                terrainTriplanar(
                    uForestRoughness,
                    vTerrainWorldPos,
                    terrainRoughNormal,
                    uForestScale
                ).r;

            float cliffRoughness =
                terrainTriplanar(
                    uCliffRoughness,
                    vTerrainWorldPos,
                    terrainRoughNormal,
                    uCliffScale
                ).r;

            float roughnessFactor = clamp(
                sandRoughness * terrainRoughWeights.x +
                grassRoughness * terrainRoughWeights.y +
                forestRoughness * terrainRoughWeights.z +
                cliffRoughness * terrainRoughWeights.w,
                0.35,
                1.0
            );
            `
        );

        /*
         * NORMAL MAPS
         */
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <normal_fragment_maps>",
            `
            vec3 terrainBaseNormal =
                normalize(vTerrainWorldNormal);

            vec4 terrainNormalWeights =
                terrainBlendWeights(
                    vTerrainWorldPos,
                    terrainBaseNormal
                );

            vec3 sandDetailNormal =
                terrainTriplanarNormal(
                    uSandNormal,
                    vTerrainWorldPos,
                    terrainBaseNormal,
                    uSandScale
                );

            vec3 grassDetailNormal =
                terrainTriplanarNormal(
                    uGrassNormal,
                    vTerrainWorldPos,
                    terrainBaseNormal,
                    uGrassScale
                );

            vec3 forestDetailNormal =
                terrainTriplanarNormal(
                    uForestNormal,
                    vTerrainWorldPos,
                    terrainBaseNormal,
                    uForestScale
                );

            vec3 cliffDetailNormal =
                terrainTriplanarNormal(
                    uCliffNormal,
                    vTerrainWorldPos,
                    terrainBaseNormal,
                    uCliffScale
                );

            /*
             * Riduciamo leggermente la forza delle mappe,
             * perché il terreno ha già una geometria molto marcata.
             */
            sandDetailNormal =
                normalize(
                    mix(
                        terrainBaseNormal,
                        sandDetailNormal,
                        0.55
                    )
                );

            grassDetailNormal =
                normalize(
                    mix(
                        terrainBaseNormal,
                        grassDetailNormal,
                        0.58
                    )
                );

            forestDetailNormal =
                normalize(
                    mix(
                        terrainBaseNormal,
                        forestDetailNormal,
                        0.62
                    )
                );

            cliffDetailNormal =
                normalize(
                    mix(
                        terrainBaseNormal,
                        cliffDetailNormal,
                        0.78
                    )
                );

            vec3 terrainMappedWorldNormal =
                normalize(
                    sandDetailNormal *
                        terrainNormalWeights.x +

                    grassDetailNormal *
                        terrainNormalWeights.y +

                    forestDetailNormal *
                        terrainNormalWeights.z +

                    cliffDetailNormal *
                        terrainNormalWeights.w
                );

            /*
             * MeshStandardMaterial lavora qui in view space.
             */
            normal =
                normalize(
                    mat3(viewMatrix) *
                    terrainMappedWorldNormal
                );
            `
        );

        material.userData.terrainShader = shader;
    };

    material.customProgramCacheKey = () =>
        "terrain-triplanar-four-material-normal-v2";

    startTextureLoading();

    return material;
}

export function bindTerrainMaterial(mesh, terrain) {
    mesh.onBeforeRender = () => {
        const shader =
            material?.userData.terrainShader;

        if (!shader) return;

        shader.uniforms.uSeaLevel.value =
            terrain.seaLevel;

        shader.uniforms.uMaxHeight.value =
            terrain.maxHeight;

        shader.uniforms.uIslandCenter.value.set(
            terrain.center.x,
            terrain.center.y
        );

        shader.uniforms.uIslandRadius.value.set(
            terrain.radiusX,
            terrain.radiusZ
        );
    };
}