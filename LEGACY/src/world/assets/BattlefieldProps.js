import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class BattlefieldProps {
    static TYPES = Object.freeze({
        AMMO_SHELLS: "AmmoShells",
        WOODEN_HEDGEHOG_A: "WoodenHedgehog_A",
        METAL_HEDGEHOG: "MetalHedgehog",
        WOODEN_HEDGEHOG_B: "WoodenHedgehog_B",
        WOODEN_BARRIER: "WoodenBarrier",
        BUNKER: "Bunker",
        HESCO: "HescoBarrier",
        COVERED_CRATE_A: "CoveredCrate_A",
        COVERED_CRATE_B: "CoveredCrate_B",
        SANDBAGS_A: "Sandbags_A",
        SANDBAGS_B: "Sandbags_B",
        SANDBAGS_STACK: "SandbagsStack",
        BARBED_WIRE: "BarbedWire"
    });

    constructor(scene) {
        this.scene = scene;
        this.loaded = false;
        this.library = null;
        this.templates = new Map();
        this.instances = [];

        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = new Map();

        this.materials = this._createMaterials();

        this.ready = this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        if (this.textureCache.has(filename)) {
            return this.textureCache.get(filename);
        }

        const texture = this.textureLoader.load(
            `./assets/models/environment/battlefield-props/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        this.textureCache.set(filename, texture);

        return texture;
    }

    _basicPBR({
        map = null,
        normalMap = null,
        roughness = 0.8,
        metalness = 0,
        side = THREE.FrontSide,
        alphaTest = 0
    } = {}) {
        return new THREE.MeshStandardMaterial({
            map,
            normalMap,
            roughness,
            metalness,
            side,
            alphaTest
        });
    }

    _createMaterials() {
        const woodMap = this._loadTexture("wood_basecolor.jpg", THREE.SRGBColorSpace);
        const woodNormal = this._loadTexture("wood_normal.jpg");

        const rustMap = this._loadTexture("rust_basecolor.jpg", THREE.SRGBColorSpace);
        const rustNormal = this._loadTexture("rust_normal.jpg");

        const bunkerMap = this._loadTexture("bunker_basecolor.jpg", THREE.SRGBColorSpace);
        const bunkerNormal = this._loadTexture("bunker_normal.jpg");
        const bunkerMetalRough = this._loadTexture("bunker_metalrough.jpg");

        const hescoFillMap = this._loadTexture("hesco_fill_basecolor.jpg", THREE.SRGBColorSpace);
        const hescoFillNormal = this._loadTexture("hesco_fill_normal.jpg");

        const ammoNormal = this._loadTexture("ammo_normal.jpg");

        const materials = {
            oldWood: this._basicPBR({
                map: woodMap,
                normalMap: woodNormal,
                roughness: 0.9,
                metalness: 0
            }),

            rust: this._basicPBR({
                map: rustMap,
                normalMap: rustNormal,
                roughness: 0.78,
                metalness: 0.65
            }),

            barbedWire: this._basicPBR({
                map: this._loadTexture("barbedwire_basecolor.png", THREE.SRGBColorSpace),
                roughness: 0.75,
                metalness: 0.35,
                side: THREE.DoubleSide,
                alphaTest: 0.15
            }),

            camoNetA: this._basicPBR({
                map: this._loadTexture("camonet_a_basecolor.jpg", THREE.SRGBColorSpace),
                normalMap: this._loadTexture("camonet_a_normal.jpg"),
                roughness: 0.9,
                metalness: 0,
                side: THREE.DoubleSide,
                alphaTest: 0.4
            }),

            camoNetB: this._basicPBR({
                map: this._loadTexture("camonet_b_basecolor.png", THREE.SRGBColorSpace),
                roughness: 0.9,
                metalness: 0,
                side: THREE.DoubleSide,
                alphaTest: 0.4
            }),

            militaryCrate: this._basicPBR({
                map: this._loadTexture("military_crate_basecolor.png", THREE.SRGBColorSpace),
                roughness: 0.75,
                metalness: 0,
                alphaTest: 0.5
            }),

            hesco: this._basicPBR({
                map: this._loadTexture("hesco_basecolor.png", THREE.SRGBColorSpace),
                roughness: 0.82,
                metalness: 0.1,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }),

            hescoFill: this._basicPBR({
                map: hescoFillMap,
                normalMap: hescoFillNormal,
                roughness: 1,
                metalness: 0
            }),

            planks: this._basicPBR({
                map: this._loadTexture("planks_basecolor.jpg", THREE.SRGBColorSpace),
                roughness: 0.9,
                metalness: 0
            }),

            stump: this._basicPBR({
                map: this._loadTexture("stump_basecolor.png", THREE.SRGBColorSpace),
                roughness: 0.95,
                metalness: 0,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }),

            sandbags: this._basicPBR({
                map: this._loadTexture("sandbags_basecolor.jpg", THREE.SRGBColorSpace),
                roughness: 0.95,
                metalness: 0
            }),

            bunker: new THREE.MeshStandardMaterial({
                map: bunkerMap,
                normalMap: bunkerNormal,
                roughnessMap: bunkerMetalRough,
                metalnessMap: bunkerMetalRough,
                roughness: 1,
                metalness: 1
            }),

            ammoBrown: this._basicPBR({
                normalMap: ammoNormal,
                roughness: 0.55,
                metalness: 0.65
            }),

            ammoGreen: this._basicPBR({
                normalMap: ammoNormal,
                roughness: 0.58,
                metalness: 0.55
            }),

            ammoRed: this._basicPBR({
                normalMap: ammoNormal,
                roughness: 0.58,
                metalness: 0.55
            })
        };

        materials.ammoBrown.color.set(0x494413);
        materials.ammoGreen.color.set(0x1d2b12);
        materials.ammoRed.color.set(0x3e1010);

        return materials;
    }

    _getReplacementMaterial(name) {
        const materials = this.materials;

        const map = {
            "Old wood": materials.oldWood,
            "Old wood.001": materials.oldWood,

            "Rust 01": materials.rust,
            "Rust 01.001": materials.rust,

            "barbed_wiere": materials.barbedWire,

            "Camouflage Netting": materials.camoNetA,
            "camo_net": materials.camoNetB,

            "military_box-min": materials.militaryCrate,

            "HESCO": materials.hesco,
            "Rocky ground": materials.hescoFill,

            "Wood Planks": materials.planks,
            "tree_stump": materials.stump,

            "Burlap Upholstery for Rough Sacks": materials.sandbags,

            "Damaged plaster": materials.bunker,

            "Material.003": materials.ammoBrown,
            "Material.002": materials.ammoGreen,
            "Material.004": materials.ammoRed
        };

        return map[name] ?? null;
    }

    _replaceMaterial(material) {
        if (!material) return material;

        const replacement = this._getReplacementMaterial(material.name);

        if (!replacement) {
            console.warn(`Battlefield material not mapped: "${material.name}"`);
            return material;
        }

        return replacement;
    }

    _prepareLibrary(model) {
        model.traverse((child) => {
            if (!child.isMesh) return;

            if (Array.isArray(child.material)) {
                child.material = child.material.map((material) => this._replaceMaterial(material));
            } else {
                child.material = this._replaceMaterial(child.material);
            }

            child.castShadow = true;
            child.receiveShadow = true;
        });
    }

    _registerTemplates() {
        for (const type of Object.values(BattlefieldProps.TYPES)) {
            const object = this.library.getObjectByName(type);

            if (!object) {
                console.warn(`Battlefield template not found: ${type}`);
                continue;
            }

            this.templates.set(type, object);

            object.updateWorldMatrix(true, true);

            const box = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            box.getSize(size);

            console.log(
                `${type} loaded: size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`
            );
        }

        console.log(
            `Battlefield Props loaded: ${this.templates.size}/${Object.keys(BattlefieldProps.TYPES).length} templates`
        );
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/battlefield-props/battlefield-props.glb",
                (gltf) => {
                    this.library = gltf.scene;

                    this._prepareLibrary(this.library);
                    this._registerTemplates();

                    this.loaded = true;

                    resolve(this);
                },
                undefined,
                (error) => {
                    console.error("Error loading Battlefield Props:", error);
                    reject(error);
                }
            );
        });
    }

    create(type, {
        position = new THREE.Vector3(),
        heading = 0,
        rotationX = 0,
        rotationZ = 0,
        scale = 1,
        parent = this.scene,
        name = null
    } = {}) {
        if (!this.loaded) {
            console.warn("BattlefieldProps.create() called before library finished loading.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown Battlefield prop type: ${type}`);
            return null;
        }

        const instance = template.clone(true);

        instance.name = name ?? `${type}_Instance`;
        instance.position.copy(position);
        instance.rotation.set(rotationX, heading, rotationZ);
        instance.scale.setScalar(scale);

        instance.traverse((child) => {
            if (!child.isMesh) return;

            child.castShadow = true;
            child.receiveShadow = true;
        });

        parent.add(instance);

        this.instances.push(instance);

        return instance;
    }

    remove(instance) {
        if (!instance) return;

        instance.removeFromParent();

        const index = this.instances.indexOf(instance);

        if (index !== -1) {
            this.instances.splice(index, 1);
        }
    }

    clear() {
        for (const instance of [...this.instances]) {
            this.remove(instance);
        }
    }

    getAvailableTypes() {
        return [...this.templates.keys()];
    }

    isLoaded() {
        return this.loaded;
    }
}