import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class MilitaryBuilding {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 0.74,
        doorOpenAngle = 100,
        doorDirection = 1
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "MilitaryBuildingRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;
        this.doorPivot = null;

        this.bounds = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();

        this.door = {
            open: false,
            progress: 0,
            target: 0,
            speed: 1.5,
            angle: THREE.MathUtils.degToRad(doorOpenAngle),
            direction: doorDirection
        };

        this.doorBaseQuaternion = new THREE.Quaternion();
        this.doorOffsetQuaternion = new THREE.Quaternion();
        this.localZAxis = new THREE.Vector3(0, 0, 1);

        this.materials = this._createMaterials();

        this.scene.add(this.root);
        this._load();
    }

    _loadTexture(filename, colorSpace = THREE.NoColorSpace) {
        const basePath = "./assets/models/environment/military-building/textures/";
        const texture = new THREE.TextureLoader().load(`${basePath}${filename}`);

        texture.colorSpace = colorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        return texture;
    }

    _createPBR({
        map = null,
        normalMap = null,
        roughnessMap = null,
        metalnessMap = null,
        emissiveMap = null,
        color = 0xffffff,
        roughness = 1,
        metalness = 0,
        emissive = 0x000000,
        emissiveIntensity = 0
    } = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            map,
            normalMap,
            roughnessMap,
            metalnessMap,
            emissiveMap,
            roughness,
            metalness,
            emissive,
            emissiveIntensity
        });
    }

    _createMaterials() {
        const tex = (name, sRGB = false) => this._loadTexture(
            name,
            sRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace
        );

        const ceiling = this._createPBR({
            map: tex("ceiling_basecolor.jpg", true),
            normalMap: tex("ceiling_normal.png"),
            roughnessMap: tex("ceiling_roughness.jpg"),
            metalnessMap: tex("ceiling_metalness.jpg"),
            emissiveMap: tex("ceiling_emission.jpg", true),
            metalness: 1,
            roughness: 1,
            emissive: 0xffffff,
            emissiveIntensity: 1.4
        });

        const door = this._createPBR({
            map: tex("door_basecolor.jpg", true),
            normalMap: tex("door_normal.png"),
            roughnessMap: tex("door_roughness.jpg"),
            metalnessMap: tex("door_metalness.jpg"),
            metalness: 1,
            roughness: 1
        });

        const innerWalls = this._createPBR({
            map: tex("innerwalls_basecolor.jpg", true),
            normalMap: tex("innerwalls_normal.png"),
            roughnessMap: tex("innerwalls_roughness.jpg"),
            roughness: 1,
            metalness: 0
        });

        const outerWalls = this._createPBR({
            map: tex("outerwalls_basecolor.jpg", true),
            normalMap: tex("outerwalls_normal.png"),
            roughnessMap: tex("outerwalls_roughness.jpg"),
            roughness: 1,
            metalness: 0
        });

        const roof = this._createPBR({
            map: tex("roof_basecolor.jpg", true),
            normalMap: tex("roof_normal.png"),
            roughnessMap: tex("roof_roughness.jpg"),
            roughness: 1,
            metalness: 0.05
        });

        const floor = this._createPBR({
            map: tex("floor_basecolor.jpg", true),
            normalMap: tex("floor_normal.png"),
            roughnessMap: tex("floor_roughness.jpg"),
            roughness: 1,
            metalness: 0
        });

        const darkMetal = new THREE.MeshStandardMaterial({
            color: 0x343a3d,
            roughness: 0.55,
            metalness: 0.8
        });

        const outerFloor = new THREE.MeshStandardMaterial({
            color: 0x777570,
            roughness: 0.9,
            metalness: 0
        });

        const windowFrame = new THREE.MeshStandardMaterial({
            color: 0x272d30,
            roughness: 0.45,
            metalness: 0.75
        });

        const glass = new THREE.MeshStandardMaterial({
            color: 0x9ec7d5,
            roughness: 0.12,
            metalness: 0,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        return {
            Door: door,
            Door_and_Elevator: darkMetal,
            Floor_1: floor,
            Outer_Walls: outerWalls,
            Railing: darkMetal,
            O_floor: outerFloor,
            Roof_1: roof,
            Ceiling: ceiling,
            Inner_walls: innerWalls,
            window: windowFrame,
            glass
        };
    }

    _replaceMaterial(material) {
        if (!material) return material;

        const replacement = this.materials[material.name];
        return replacement ?? material;
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
            "./assets/models/environment/military-building/military-building.glb",
            (gltf) => {
                this.model = gltf.scene;

                this._applyMaterials(this.model);

                this.doorPivot = this.model.getObjectByName("Door_Pivot");

                if (this.doorPivot) {
                    this.doorBaseQuaternion.copy(this.doorPivot.quaternion);
                    console.log("Door_Pivot found.");
                } else {
                    console.warn("Door_Pivot not found.");
                }

                this.root.add(this.model);
                this.root.updateWorldMatrix(true, true);

                this.bounds.setFromObject(this.root, true);
                this.bounds.getSize(this.boundsSize);

                this.loaded = true;

                console.log(
                    `Military Building loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                );
            },
            undefined,
            (error) => {
                console.error("Error loading military building:", error);
            }
        );
    }

    _updateDoor(deltaTime) {
        if (!this.doorPivot) return;

        const direction = Math.sign(this.door.target - this.door.progress);
        const step = this.door.speed * deltaTime;

        if (Math.abs(this.door.target - this.door.progress) <= step) {
            this.door.progress = this.door.target;
        } else {
            this.door.progress += direction * step;
        }

        const t = THREE.MathUtils.smoothstep(this.door.progress, 0, 1);
        const angle = this.door.angle * this.door.direction * t;

        this.doorOffsetQuaternion.setFromAxisAngle(this.localZAxis, angle);

        this.doorPivot.quaternion
            .copy(this.doorBaseQuaternion)
            .multiply(this.doorOffsetQuaternion);
    }

    update(deltaTime) {
        if (!this.loaded) return;
        this._updateDoor(deltaTime);
    }

    openDoor() {
        this.door.open = true;
        this.door.target = 1;
    }

    closeDoor() {
        this.door.open = false;
        this.door.target = 0;
    }

    toggleDoor() {
        if (this.door.open) this.closeDoor();
        else this.openDoor();
    }

    isDoorOpen() {
        return this.door.open && this.door.progress >= 0.99;
    }

    getObject3D() {
        return this.root;
    }

    isLoaded() {
        return this.loaded;
    }
}