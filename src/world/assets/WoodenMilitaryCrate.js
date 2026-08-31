import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class WoodenMilitaryCrate {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        debug = false
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "WoodenMilitaryCrateRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;
        this.lid = null;
        this.latch = null;

        this.bounds = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();

        this.debugVisible = debug;
        this.boundsHelper = null;

        this.textureLoader = new THREE.TextureLoader();
        this.material = this._createMaterial();

        this.scene.add(this.root);
        this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const texture = this.textureLoader.load(
            `./assets/models/environment/wooden-military-crate/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createMaterial() {
        return new THREE.MeshStandardMaterial({
            map: this._loadTexture("crate_basecolor_2k.jpg", THREE.SRGBColorSpace),
            metalnessMap: this._loadTexture("crate_metallic_2k.png"),
            normalMap: this._loadTexture("crate_normal_2k.png"),
            roughnessMap: this._loadTexture("crate_roughness_2k.png"),
            metalness: 1,
            roughness: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    _prepareModel(model) {
        model.traverse((child) => {
            if (!child.isMesh) return;

            child.material = this.material;
            child.castShadow = true;
            child.receiveShadow = true;
        });
    }

    _load() {
        const loader = new GLTFLoader();

        loader.load(
            "./assets/models/environment/wooden-military-crate/wooden-military-crate.glb",
            (gltf) => {
                this.model = gltf.scene;

                this._prepareModel(this.model);

                this.lid = this.model.getObjectByName("wooden_military_crate_lid");
                this.latch = this.model.getObjectByName("wooden_military_crate_latch");

                this.root.add(this.model);
                this.root.updateWorldMatrix(true, true);

                this.bounds.setFromObject(this.root, true);
                this.bounds.getSize(this.boundsSize);

                this.loaded = true;

                console.log(
                    `Wooden Military Crate loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                );

                if (this.debugVisible) this._createBoundsHelper();
            },
            undefined,
            (error) => {
                console.error("Error loading Wooden Military Crate:", error);
            }
        );
    }

    _createBoundsHelper() {
        if (this.boundsHelper) this.scene.remove(this.boundsHelper);

        this.root.updateWorldMatrix(true, true);

        this.boundsHelper = new THREE.Box3Helper(
            new THREE.Box3().setFromObject(this.root),
            0xff00ff
        );

        this.boundsHelper.visible = this.debugVisible;
        this.scene.add(this.boundsHelper);
    }

    setDebugVisible(visible) {
        this.debugVisible = visible;

        if (!this.loaded) return;

        if (!this.boundsHelper && visible) this._createBoundsHelper();
        if (this.boundsHelper) this.boundsHelper.visible = visible;
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