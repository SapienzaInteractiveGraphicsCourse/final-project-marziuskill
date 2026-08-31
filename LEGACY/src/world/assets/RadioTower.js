import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class RadioTower {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        debug = false
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "RadioTowerRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;

        this.bounds = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();

        this.debugVisible = debug;
        this.boundsHelper = null;

        this.materials = this._createMaterials();

        this.scene.add(this.root);
        this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const path = `./assets/models/environment/radio-tower/textures/${filename}`;
        const texture = new THREE.TextureLoader().load(path);

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createPBRMaterial(prefix) {
        const map = this._loadTexture(`${prefix}_basecolor.png`, THREE.SRGBColorSpace);
        const metalnessMap = this._loadTexture(`${prefix}_metallic.png`);
        const normalMap = this._loadTexture(`${prefix}_normal.png`);
        const roughnessMap = this._loadTexture(`${prefix}_roughness.png`);

        return new THREE.MeshStandardMaterial({
            map,
            metalnessMap,
            normalMap,
            roughnessMap,
            metalness: 1,
            roughness: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    _createMaterials() {
        return {
            Base: this._createPBRMaterial("base"),
            Energy: this._createPBRMaterial("energy"),
            Sectorial: this._createPBRMaterial("sectorial"),
            Stairs: this._createPBRMaterial("stairs"),
            Tower_color01: this._createPBRMaterial("tower01"),
            Tower_color02: this._createPBRMaterial("tower02")
        };
    }

    _replaceMaterial(material) {
        if (!material) return material;

        const replacement = this.materials[material.name];

        if (!replacement) {
            console.warn(`Radio Tower material not mapped: ${material.name}`);
            return material;
        }

        return replacement;
    }

    _applyMaterials(model) {
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

    _load() {
        const loader = new GLTFLoader();

        loader.load(
            "./assets/models/environment/radio-tower/radio-tower.glb",
            (gltf) => {
                this.model = gltf.scene;

                this._applyMaterials(this.model);
                this.root.add(this.model);

                this.root.updateWorldMatrix(true, true);

                this.bounds.setFromObject(this.root, true);
                this.bounds.getSize(this.boundsSize);

                this.loaded = true;

                console.log(
                    `Radio Tower loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                );

                if (this.debugVisible) {
                    this._createBoundsHelper();
                }
            },
            undefined,
            (error) => {
                console.error("Error loading Radio Tower:", error);
            }
        );
    }

    _createBoundsHelper() {
        if (this.boundsHelper) {
            this.scene.remove(this.boundsHelper);
        }

        this.root.updateWorldMatrix(true, true);

        const box = new THREE.Box3().setFromObject(this.root);

        this.boundsHelper = new THREE.Box3Helper(box, 0xff00ff);
        this.boundsHelper.visible = this.debugVisible;

        this.scene.add(this.boundsHelper);
    }

    setDebugVisible(visible) {
        this.debugVisible = visible;

        if (!this.loaded) return;

        if (!this.boundsHelper && visible) {
            this._createBoundsHelper();
        }

        if (this.boundsHelper) {
            this.boundsHelper.visible = visible;
        }
    }

    toggleDebug() {
        this.setDebugVisible(!this.debugVisible);
        return this.debugVisible;
    }

    getObject3D() {
        return this.root;
    }

    isLoaded() {
        return this.loaded;
    }
}