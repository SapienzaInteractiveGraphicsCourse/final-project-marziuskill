import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Hangar {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        textureRepeat = 2,
        debug = false
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "HangarRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;
        this.entrance = null;
        this.servicePoint = null;

        this.bounds = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();

        this.debugVisible = debug;
        this.debugObjects = [];

        this.scene.add(this.root);

        this.ready = this._load(textureRepeat);
    }

    _loadTexture(path, colorSpace, repeat) {
        const texture = new THREE.TextureLoader().load(path);

        texture.colorSpace = colorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat, repeat);

        return texture;
    }

    _createMaterial(textureRepeat) {
        const basePath = "./assets/models/environment/hangar/textures/";

        const map = this._loadTexture(
            `${basePath}hangar_diffuse_2k.jpg`,
            THREE.SRGBColorSpace,
            textureRepeat
        );

        const normalMap = this._loadTexture(
            `${basePath}hangar_normal_2k.png`,
            THREE.NoColorSpace,
            textureRepeat
        );

        const roughnessMap = this._loadTexture(
            `${basePath}hangar_roughness_2k.png`,
            THREE.NoColorSpace,
            textureRepeat
        );

        return new THREE.MeshStandardMaterial({
            map,
            normalMap,
            roughnessMap,
            metalness: 0.65,
            roughness: 1,
            normalScale: new THREE.Vector2(0.8, 0.8),
            side: THREE.DoubleSide
        });
    }

    _load(textureRepeat) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            const material = this._createMaterial(textureRepeat);

            loader.load(
                "./assets/models/environment/hangar/hangar.glb",
                (gltf) => {
                    this.model = gltf.scene;

                    this.model.traverse((child) => {
                        if (!child.isMesh) return;

                        child.material = material;
                        child.castShadow = true;
                        child.receiveShadow = true;
                    });

                    this.root.add(this.model);

                    this.entrance = this.model.getObjectByName("HangarEntrance");
                    this.servicePoint = this.model.getObjectByName("HangarService");

                    if (!this.entrance) {
                        console.error("HangarEntrance not found.");
                    }

                    if (!this.servicePoint) {
                        console.error("HangarService not found.");
                    }

                    this.root.updateWorldMatrix(true, true);

                    this.bounds.setFromObject(this.root, true);
                    this.bounds.getSize(this.boundsSize);

                    console.log(
                        `Hangar loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                    );

                    if (this.entrance) {
                        console.log(
                            `HangarEntrance local: (${this.entrance.position.x.toFixed(2)}, ${this.entrance.position.y.toFixed(2)}, ${this.entrance.position.z.toFixed(2)})`
                        );
                    }

                    if (this.servicePoint) {
                        console.log(
                            `HangarService local: (${this.servicePoint.position.x.toFixed(2)}, ${this.servicePoint.position.y.toFixed(2)}, ${this.servicePoint.position.z.toFixed(2)})`
                        );
                    }

                    this._createDebugObjects();

                    this.loaded = true;
                    console.log("Hangar loaded successfully.");

                    resolve(this);
                },
                undefined,
                (error) => {
                    console.error("Error loading hangar:", error);
                    reject(error);
                }
            );
        });
    }

    _createDebugObjects() {
        if (!this.entrance || !this.servicePoint) return;

        const entranceMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 12, 8),
            new THREE.MeshBasicMaterial({
                color: 0x00ff66,
                depthTest: false
            })
        );

        entranceMarker.renderOrder = 100;
        entranceMarker.visible = this.debugVisible;
        this.entrance.add(entranceMarker);

        const serviceMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 12, 8),
            new THREE.MeshBasicMaterial({
                color: 0x3399ff,
                depthTest: false
            })
        );

        serviceMarker.renderOrder = 100;
        serviceMarker.visible = this.debugVisible;
        this.servicePoint.add(serviceMarker);

        const direction = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(0, 0, 0),
            3,
            0x00ff66
        );

        direction.visible = this.debugVisible;
        this.entrance.add(direction);

        this.debugObjects.push(
            entranceMarker,
            serviceMarker,
            direction
        );
    }

    setDebugVisible(visible) {
        this.debugVisible = visible;

        for (const object of this.debugObjects) {
            object.visible = visible;
        }
    }

    toggleDebug() {
        this.setDebugVisible(!this.debugVisible);
        return this.debugVisible;
    }

    getEntranceWorldPosition(target = new THREE.Vector3()) {
        if (!this.entrance) return null;

        this.entrance.getWorldPosition(target);
        return target;
    }

    getServiceWorldPosition(target = new THREE.Vector3()) {
        if (!this.servicePoint) return null;

        this.servicePoint.getWorldPosition(target);
        return target;
    }

    getObject3D() {
        return this.root;
    }

    isLoaded() {
        return this.loaded;
    }
}