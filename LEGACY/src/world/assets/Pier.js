import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Pier {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1
    } = {}) {
        this.scene = scene;

        this.root = new THREE.Group();
        this.root.name = "PierRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;
        this.loaded = false;

        this.textureLoader = new THREE.TextureLoader();
        this.material = this._createMaterial();

        this.scene.add(this.root);
        this.ready = this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const texture = this.textureLoader.load(
            `./assets/models/environment/pier/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createMaterial() {
        return new THREE.MeshStandardMaterial({
            map: this._loadTexture("pier_basecolor.jpg", THREE.SRGBColorSpace),
            aoMap: this._loadTexture("pier_ao.jpg"),
            metalnessMap: this._loadTexture("pier_metallic.jpg"),
            normalMap: this._loadTexture("pier_normal.png"),
            roughnessMap: this._loadTexture("pier_roughness.jpg"),

            metalness: 1,
            roughness: 1,
            aoMapIntensity: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/pier/pier.glb",

                (gltf) => {
                    this.model = gltf.scene;
                    this.model.name = "Pier";

                    this.model.traverse((child) => {
                        if (!child.isMesh) return;

                        child.material = this.material;
                        child.castShadow = true;
                        child.receiveShadow = true;

                        // aoMap normalmente usa il secondo set UV.
                        // Il nostro atlas AO usa gli stessi UV del BaseColor.
                        if (
                            child.geometry.attributes.uv &&
                            !child.geometry.attributes.uv1
                        ) {
                            child.geometry.setAttribute(
                                "uv1",
                                child.geometry.attributes.uv
                            );
                        }

                        child.geometry.computeBoundingBox();
                        child.geometry.computeBoundingSphere();
                    });

                    this.root.add(this.model);
                    this.root.updateMatrixWorld(true);

                    const box = new THREE.Box3().setFromObject(this.model);
                    const size = new THREE.Vector3();
                    box.getSize(size);

                    this.loaded = true;

                    console.log(
                        `Pier loaded: size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`
                    );

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Pier:", error);
                    reject(error);
                }
            );
        });
    }

    setPosition(x, y, z) {
        this.root.position.set(x, y, z);
    }

    setHeading(heading) {
        this.root.rotation.y = heading;
    }

    setScale(scale) {
        this.root.scale.setScalar(scale);
    }

    setVisible(visible) {
        this.root.visible = visible;
    }

    remove() {
        this.root.removeFromParent();
    }

    isLoaded() {
        return this.loaded;
    }
}