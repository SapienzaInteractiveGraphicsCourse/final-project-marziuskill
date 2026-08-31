import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class WatchTower {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        debug = false
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "WatchTowerRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;
        this.bounds = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();

        this.debugVisible = debug;
        this.boundsHelper = null;

        this.material = this._createMaterial();

        this.scene.add(this.root);
        this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const path = `./assets/models/environment/watchtower/textures/${filename}`;
        const texture = new THREE.TextureLoader().load(path);

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createMaterial() {
        const map = this._loadTexture(
            "watchtower_basecolor.png",
            THREE.SRGBColorSpace
        );

        const metalnessMap = this._loadTexture(
            "watchtower_metallic.png"
        );

        const roughnessMap = this._loadTexture(
            "watchtower_roughness.png"
        );

        const normalMap = this._loadTexture(
            "watchtower_normal.png"
        );

        const aoMap = this._loadTexture(
            "watchtower_ao.png"
        );

        return new THREE.MeshStandardMaterial({
            map,
            metalnessMap,
            roughnessMap,
            normalMap,
            aoMap,

            metalness: 1,
            roughness: 1,

            normalScale: new THREE.Vector2(1, 1),
            aoMapIntensity: 1
        });
    }

    _prepareGeometry(geometry) {
        const uv = geometry.getAttribute("uv");

        if (!uv) {
            console.warn("Watch Tower mesh has no UV coordinates.");
            return;
        }

        /*
         * AO needs a secondary UV channel.
         * This asset uses the same atlas for all PBR maps,
         * so duplicating UV0 is correct here.
         *
         * uv1 is used by current Three.js versions.
         * uv2 is also provided for compatibility with older versions.
         */
        if (!geometry.getAttribute("uv1")) {
            geometry.setAttribute("uv1", uv.clone());
        }

        if (!geometry.getAttribute("uv2")) {
            geometry.setAttribute("uv2", uv.clone());
        }
    }

    _applyMaterial(model) {
        model.traverse((child) => {
            if (!child.isMesh) return;

            this._prepareGeometry(child.geometry);

            child.material = this.material;
            child.castShadow = true;
            child.receiveShadow = true;
        });
    }

    _load() {
        const loader = new GLTFLoader();

        loader.load(
            "./assets/models/environment/watchtower/watchtower.glb",
            (gltf) => {
                this.model = gltf.scene;

                this._applyMaterial(this.model);
                this.root.add(this.model);

                this.root.updateWorldMatrix(true, true);

                this.bounds.setFromObject(this.root, true);
                this.bounds.getSize(this.boundsSize);

                this.loaded = true;

                console.log(
                    `Watch Tower loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                );

                if (this.debugVisible) {
                    this._createBoundsHelper();
                }
            },
            undefined,
            (error) => {
                console.error("Error loading Watch Tower:", error);
            }
        );
    }

    _createBoundsHelper() {
        if (this.boundsHelper) {
            this.root.remove(this.boundsHelper);
        }

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