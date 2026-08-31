import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Rocks {
    static TYPES = Object.freeze({
        ROCK_01: "Rock_01",
        ROCK_02: "Rock_02",
        ROCK_03: "Rock_03",
        ROCK_04: "Rock_04",
        ROCK_05: "Rock_05",
        ROCK_06: "Rock_06"
    });

    constructor(scene) {
        this.scene = scene;
        this.loaded = false;

        this.library = null;
        this.templates = new Map();
        this.materials = new Map();

        this.instances = [];
        this.instancedGroups = [];

        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = new Map();

        this.ready = this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        if (this.textureCache.has(filename)) return this.textureCache.get(filename);

        const texture = this.textureLoader.load(
            `./assets/models/environment/rocks/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        this.textureCache.set(filename, texture);
        return texture;
    }

    _createMaterial(index) {
        const id = String(index).padStart(2, "0");

        return new THREE.MeshStandardMaterial({
            map: this._loadTexture(`rock_${id}_basecolor.png`, THREE.SRGBColorSpace),
            normalMap: this._loadTexture(`rock_${id}_normal.png`),
            roughnessMap: this._loadTexture(`rock_${id}_roughness.png`),
            color: new THREE.Color().setRGB(1.12, 1.12, 1.12),
            metalness: 0,
            roughness: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    _prepareTemplate(template, material) {
        template.traverse((child) => {
            if (!child.isMesh) return;

            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;

            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
        });
    }

    _registerTemplate(type, index) {
        const template = this.library.getObjectByName(type);

        if (!template) {
            console.error(`Rocks template not found: ${type}`);
            return;
        }

        const material = this._createMaterial(index);

        this.materials.set(type, material);
        this._prepareTemplate(template, material);
        this.templates.set(type, template);

        this.library.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(template);
        const size = new THREE.Vector3();
        box.getSize(size);

        console.log(
            `${type} loaded: size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`
        );
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/rocks/rocks.glb",

                (gltf) => {
                    this.library = gltf.scene;

                    Object.values(Rocks.TYPES).forEach((type, index) => {
                        this._registerTemplate(type, index + 1);
                    });

                    this.loaded = true;

                    console.log(
                        `Rocks loaded: ${this.templates.size}/${Object.keys(Rocks.TYPES).length} templates`
                    );

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Rocks:", error);
                    reject(error);
                }
            );
        });
    }

    create(type, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        tiltX = 0,
        tiltZ = 0,
        parent = this.scene,
        name = null
    } = {}) {
        if (!this.loaded) {
            console.warn("Rocks.create() called before library finished loading.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown Rocks type: ${type}`);
            return null;
        }

        const instance = template.clone(true);

        instance.name = name ?? `${type}_Instance`;
        instance.position.copy(position);
        instance.rotation.set(tiltX, heading, tiltZ);

        if (typeof scale === "number") instance.scale.setScalar(scale);
        else instance.scale.copy(scale);

        instance.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
        });

        parent.add(instance);
        this.instances.push(instance);

        return instance;
    }

    _collectMeshParts(template) {
        template.updateWorldMatrix(true, true);

        const inverse = new THREE.Matrix4().copy(template.matrixWorld).invert();
        const parts = [];

        template.traverse((child) => {
            if (!child.isMesh) return;

            child.updateWorldMatrix(true, false);

            parts.push({
                geometry: child.geometry,
                material: child.material,
                relativeMatrix: new THREE.Matrix4().multiplyMatrices(
                    inverse,
                    child.matrixWorld
                )
            });
        });

        return parts;
    }

    createInstanced(type, placements, {
        parent = this.scene,
        name = null
    } = {}) {
        if (!this.loaded) {
            console.warn("Rocks.createInstanced() called before library finished loading.");
            return null;
        }

        if (!placements || placements.length === 0) {
            console.warn("Rocks.createInstanced(): no placements supplied.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown Rocks type: ${type}`);
            return null;
        }

        const group = new THREE.Group();
        group.name = name ?? `${type}_Instanced`;

        const parts = this._collectMeshParts(template);
        const dummy = new THREE.Object3D();
        const finalMatrix = new THREE.Matrix4();

        parts.forEach((part, partIndex) => {
            const mesh = new THREE.InstancedMesh(
                part.geometry,
                part.material,
                placements.length
            );

            mesh.name = `${group.name}_Part${partIndex + 1}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            placements.forEach((placement, index) => {
                const {
                    position = new THREE.Vector3(),
                    heading = 0,
                    scale = 1,
                    tiltX = 0,
                    tiltZ = 0
                } = placement;

                dummy.position.copy(position);
                dummy.rotation.set(tiltX, heading, tiltZ);

                if (typeof scale === "number") dummy.scale.setScalar(scale);
                else dummy.scale.copy(scale);

                dummy.updateMatrix();

                finalMatrix.multiplyMatrices(
                    dummy.matrix,
                    part.relativeMatrix
                );

                mesh.setMatrixAt(index, finalMatrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();

            group.add(mesh);
        });

        parent.add(group);
        this.instancedGroups.push(group);

        return group;
    }

    remove(instance) {
        if (!instance) return;

        instance.removeFromParent();

        let index = this.instances.indexOf(instance);
        if (index !== -1) this.instances.splice(index, 1);

        index = this.instancedGroups.indexOf(instance);
        if (index !== -1) this.instancedGroups.splice(index, 1);
    }

    clear() {
        for (const instance of [...this.instances, ...this.instancedGroups]) {
            instance.removeFromParent();
        }

        this.instances.length = 0;
        this.instancedGroups.length = 0;
    }

    getAvailableTypes() {
        return [...this.templates.keys()];
    }

    isLoaded() {
        return this.loaded;
    }
}