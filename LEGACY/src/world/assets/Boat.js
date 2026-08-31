import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Boat {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        animate = true,
        bobAmplitude = 0.035,
        bobSpeed = 1.0,
        rollAmplitude = THREE.MathUtils.degToRad(1.2),
        pitchAmplitude = THREE.MathUtils.degToRad(0.7),
        floatOffset = 0.40
    } = {}) {
        this.scene = scene;

        this.root = new THREE.Group();
        this.root.name = "BoatRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.motionRoot = new THREE.Group();
        this.motionRoot.name = "BoatMotionRoot";
        this.root.add(this.motionRoot);
        this.floatOffset = floatOffset;
        this.motionRoot.position.y = this.floatOffset;

        this.model = null;
        this.loaded = false;

        this.animate = animate;
        this.bobAmplitude = bobAmplitude;
        this.bobSpeed = bobSpeed;
        this.rollAmplitude = rollAmplitude;
        this.pitchAmplitude = pitchAmplitude;

        this.time = Math.random() * Math.PI * 2;

        this.textureLoader = new THREE.TextureLoader();
        this.material = this._createMaterial();

        scene.add(this.root);

        this.ready = this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const texture = this.textureLoader.load(
            `./assets/models/environment/boat/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createMaterial() {
        return new THREE.MeshStandardMaterial({
            map: this._loadTexture("boat_basecolor.png", THREE.SRGBColorSpace),
            metalnessMap: this._loadTexture("boat_metallic.png"),
            normalMap: this._loadTexture("boat_normal.png"),
            roughnessMap: this._loadTexture("boat_roughness.png"),
            metalness: 1,
            roughness: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/boat/boat.glb",

                (gltf) => {
                    const rawModel = gltf.scene;

                    // misura locale PRIMA di parent/rotazioni del mondo
                    const localBox = new THREE.Box3().setFromObject(rawModel);
                    const localSize = new THREE.Vector3();
                    localBox.getSize(localSize);

                    this.model = rawModel;
                    this.model.name = "Boat";

                    this.model.traverse((child) => {
                        if (!child.isMesh) return;

                        child.material = this.material;
                        child.castShadow = true;
                        child.receiveShadow = true;

                        child.geometry.computeBoundingBox();
                        child.geometry.computeBoundingSphere();
                    });

                    this.motionRoot.add(this.model);
                    this.root.updateMatrixWorld(true);

                    this.loaded = true;

                    console.log(
                        `Boat loaded: size=(${localSize.x.toFixed(2)}, ${localSize.y.toFixed(2)}, ${localSize.z.toFixed(2)})`
                    );

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Boat:", error);
                    reject(error);
                }
            );
        });
    }

    update(delta) {
        if (!this.loaded || !this.animate) return;

        this.time += delta * this.bobSpeed;

        const bob = Math.sin(this.time) * this.bobAmplitude;
        const roll = Math.sin(this.time * 0.83 + 1.2) * this.rollAmplitude;
        const pitch = Math.sin(this.time * 0.61 + 2.4) * this.pitchAmplitude;

        this.motionRoot.position.y = this.floatOffset + bob;
        this.motionRoot.rotation.z = roll;
        this.motionRoot.rotation.x = pitch;
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

    setAnimationEnabled(enabled) {
        this.animate = enabled;

        if (!enabled) {
            this.motionRoot.position.y = this.floatOffset;
            this.motionRoot.rotation.set(0, 0, 0);
        }
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