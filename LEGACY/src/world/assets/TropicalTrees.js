import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class TropicalTrees {
    static TYPES = Object.freeze({
        TREE_A: "TropicalTree_A",
        TREE_B: "TropicalTree_B"
    });

    constructor(scene) {
        this.scene = scene;
        this.loaded = false;

        this.library = null;
        this.templates = new Map();

        this.instances = [];
        this.instancedGroups = [];

        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = new Map();

        this.materials = this._createMaterials();

        this.ready = this._load();
    }

    _loadTexture(filename) {
        if (this.textureCache.has(filename)) return this.textureCache.get(filename);

        const texture = this.textureLoader.load(
            `./assets/models/environment/tropical-trees/textures/${filename}`
        );

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;

        this.textureCache.set(filename, texture);
        return texture;
    }

    _createMaterials() {
        const bark = new THREE.MeshStandardMaterial({
            map: this._loadTexture("tree_bark.jpg"),
            roughness: 0.95,
            metalness: 0
        });

        const foliageA = new THREE.MeshStandardMaterial({
            map: this._loadTexture("tree_foliage_a.png"),
            roughness: 0.9,
            metalness: 0,
            alphaTest: 0.4,
            side: THREE.DoubleSide
        });

        const foliageB = new THREE.MeshStandardMaterial({
            map: this._loadTexture("tree_foliage_b.png"),
            roughness: 0.9,
            metalness: 0,
            alphaTest: 0.4,
            side: THREE.DoubleSide
        });

        const flowers = new THREE.MeshStandardMaterial({
            map: this._loadTexture("tree_flowers.png"),
            roughness: 0.9,
            metalness: 0,
            alphaTest: 0.4,
            side: THREE.DoubleSide
        });

        return {bark, foliageA, foliageB, flowers};
    }

    _mapMaterial(material) {
        if (!material) return material;

        const name = material.name.toLowerCase();

        if (name.includes("bftreebranch")) return this.materials.foliageA;
        if (name.includes("pngegg")) return this.materials.foliageB;
        if (name.includes("kisspng") || name.includes("twig")) return this.materials.flowers;

        if (
            name.includes("material.001") ||
            name.includes("material001")
        ) {
            return this.materials.bark;
        }

        console.warn(`TropicalTrees material not mapped: "${material.name}"`);
        return material;
    }

    _prepareTemplate(template) {
        template.traverse((child) => {
            if (!child.isMesh) return;

            if (Array.isArray(child.material)) {
                child.material = child.material.map((material) => this._mapMaterial(material));
            } else {
                child.material = this._mapMaterial(child.material);
            }

            child.castShadow = false;
            child.receiveShadow = true;

            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
        });
    }

    _registerTemplate(type) {
        const template = this.library.getObjectByName(type);

        if (!template) {
            console.error(`TropicalTrees template not found: ${type}`);
            return;
        }

        this._prepareTemplate(template);
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
                "./assets/models/environment/tropical-trees/tropical-trees.glb",

                (gltf) => {
                    this.library = gltf.scene;

                    this._registerTemplate(TropicalTrees.TYPES.TREE_A);
                    this._registerTemplate(TropicalTrees.TYPES.TREE_B);

                    this.loaded = true;

                    console.log(
                        `Tropical Trees loaded: ${this.templates.size}/2 templates`
                    );

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Tropical Trees:", error);
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
            console.warn("TropicalTrees.create() called before library finished loading.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown TropicalTrees type: ${type}`);
            return null;
        }

        const instance = template.clone(true);

        instance.name = name ?? `${type}_Instance`;
        instance.position.copy(position);
        instance.rotation.set(tiltX, heading, tiltZ);

        if (typeof scale === "number") {
            instance.scale.setScalar(scale);
        } else {
            instance.scale.copy(scale);
        }

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

        const templateInverse = new THREE.Matrix4()
            .copy(template.matrixWorld)
            .invert();

        const parts = [];

        template.traverse((child) => {
            if (!child.isMesh) return;

            child.updateWorldMatrix(true, false);

            const relativeMatrix = new THREE.Matrix4()
                .multiplyMatrices(templateInverse, child.matrixWorld);

            parts.push({
                geometry: child.geometry,
                material: child.material,
                relativeMatrix
            });
        });

        return parts;
    }

    createInstanced(type, placements, {
        parent = this.scene,
        name = null
    } = {}) {
        if (!this.loaded) {
            console.warn("TropicalTrees.createInstanced() called before library finished loading.");
            return null;
        }

        if (!placements || placements.length === 0) {
            console.warn("TropicalTrees.createInstanced(): no placements supplied.");
            return null;
        }

        const template = this.templates.get(type);

        if (!template) {
            console.error(`Unknown TropicalTrees type: ${type}`);
            return null;
        }

        const group = new THREE.Group();
        group.name = name ?? `${type}_Instanced`;

        const parts = this._collectMeshParts(template);

        const dummy = new THREE.Object3D();
        const finalMatrix = new THREE.Matrix4();

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex];

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

                if (typeof scale === "number") {
                    dummy.scale.setScalar(scale);
                } else {
                    dummy.scale.copy(scale);
                }

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
        }

        parent.add(group);
        this.instancedGroups.push(group);

        return group;
    }

    remove(instance) {
        if (!instance) return;

        instance.removeFromParent();

        let index = this.instances.indexOf(instance);

        if (index !== -1) {
            this.instances.splice(index, 1);
        }

        index = this.instancedGroups.indexOf(instance);

        if (index !== -1) {
            this.instancedGroups.splice(index, 1);
        }
    }

    clear() {
        for (const instance of [
            ...this.instances,
            ...this.instancedGroups
        ]) {
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