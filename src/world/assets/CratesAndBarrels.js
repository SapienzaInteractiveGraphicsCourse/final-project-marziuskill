import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class CratesAndBarrels {
    static TYPES = Object.freeze({
        CRATE: "Crate003",
        BARREL_A: "Barrel_A",
        BARREL_B: "Barrel_B",
        BARREL_C: "Barrel_C",
        COVERED_CRATES: "CoveredCrates",
        COVERED_BARRELS: "CoveredBarrels"
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
            `./assets/models/environment/crates-barrels/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        this.textureCache.set(filename, texture);

        return texture;
    }

    _createPBR(prefix, {
        metalness = 0,
        doubleSide = false,
        alphaTest = 0,
        normalY = 1
    } = {}) {
        const map = this._loadTexture(`${prefix}_basecolor.png`, THREE.SRGBColorSpace);
        const aoMap = this._loadTexture(`${prefix}_ao.png`);
        const normalMap = this._loadTexture(`${prefix}_normal.png`);
        const roughnessMap = this._loadTexture(`${prefix}_roughness.png`);

        return new THREE.MeshStandardMaterial({
            map,
            aoMap,
            normalMap,
            roughnessMap,

            metalness,
            roughness: 1,

            normalScale: new THREE.Vector2(1, normalY),
            aoMapIntensity: 1,

            side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest
        });
    }

    _createMaterials() {
        return {
            Barrel: this._createPBR("barrel", {
                metalness: 0.65
            }),

            Crate: this._createPBR("crate", {
                metalness: 0
            }),

            Cloth: this._createPBR("cloth", {
                metalness: 0,
                doubleSide: true,
                alphaTest: 0.35
            }),

            Cloth2: this._createPBR("cloth2", {
                metalness: 0,
                doubleSide: true,
                alphaTest: 0.35
            })
        };
    }

    _prepareGeometry(geometry) {
        const uv = geometry.getAttribute("uv");

        if (!uv) {
            console.warn("CratesAndBarrels: mesh without UV.");
            return;
        }

        if (!geometry.getAttribute("uv1")) {
            geometry.setAttribute("uv1", uv.clone());
        }

        if (!geometry.getAttribute("uv2")) {
            geometry.setAttribute("uv2", uv.clone());
        }
    }

    _replaceMaterial(material) {
        if (!material) return material;

        const replacement = this.materials[material.name];

        if (!replacement) {
            console.warn(`CratesAndBarrels material not mapped: "${material.name}"`);
            return material;
        }

        return replacement;
    }

    _prepareLibrary(model) {
        model.traverse((child) => {
            if (!child.isMesh) return;

            this._prepareGeometry(child.geometry);

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
        for (const type of Object.values(CratesAndBarrels.TYPES)) {
            const template = this.library.getObjectByName(type);

            if (!template) {
                console.warn(`CratesAndBarrels template not found: ${type}`);
                continue;
            }

            this.templates.set(type, template);
        }

        console.log(
            `Crates & Barrels loaded: ${this.templates.size}/${Object.keys(CratesAndBarrels.TYPES).length} templates`
        );
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/crates-barrels/crates-barrels.glb",

                (gltf) => {
                    this.library = gltf.scene;

                    this._prepareLibrary(this.library);
                    this._registerTemplates();

                    this.loaded = true;

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Crates & Barrels:", error);
                    reject(error);
                }
            );
        });
    }

    create(type, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        parent = this.scene,
        name = null
    } = {}) {
        if (!this.loaded) {
            console.warn("CratesAndBarrels.create() called before library finished loading.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown CratesAndBarrels type: ${type}`);
            return null;
        }

        const instance = template.clone(true);

        instance.name = name ?? `${type}_Instance`;
        instance.position.copy(position);
        instance.rotation.y = heading;
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