import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Flak18 {
    constructor(scene, {
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        yawSpeed = 35,
        pitchSpeed = 20,
        minPitch = -5,
        maxPitch = 75,
        debug = false
    } = {}) {
        this.scene = scene;
        this.loaded = false;

        this.root = new THREE.Group();
        this.root.name = "Flak18WorldRoot";
        this.root.position.copy(position);
        this.root.rotation.y = heading;
        this.root.scale.setScalar(scale);

        this.model = null;

        this.yawPivot = null;
        this.pitchPivot = null;
        this.muzzle = null;
        this.muzzleForward = null;

        this.yaw = 0;
        this.pitch = 0;
        this.targetYaw = 0;
        this.targetPitch = 0;

        this.yawSpeed = THREE.MathUtils.degToRad(yawSpeed);
        this.pitchSpeed = THREE.MathUtils.degToRad(pitchSpeed);

        this.minPitch = THREE.MathUtils.degToRad(minPitch);
        this.maxPitch = THREE.MathUtils.degToRad(maxPitch);

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
            `./assets/models/environment/flak18/textures/${filename}`
        );

        texture.colorSpace = colorSpace;
        texture.flipY = false;

        return texture;
    }

    _createMaterial() {
        const map = this._loadTexture("flak_basecolor.png", THREE.SRGBColorSpace);
        const normalMap = this._loadTexture("flak_normal.png");
        const roughnessMap = this._loadTexture("flak_roughness.png");
        const metalnessMap = this._loadTexture("flak_metallic.png");
        const aoMap = this._loadTexture("flak_ao.png");

        return new THREE.MeshStandardMaterial({
            map,
            normalMap,
            roughnessMap,
            metalnessMap,
            aoMap,

            roughness: 1,
            metalness: 1,

            normalScale: new THREE.Vector2(1, 1),
            aoMapIntensity: 1
        });
    }

    _prepareGeometry(geometry) {
        const uv = geometry.getAttribute("uv");

        if (!uv) return;

        if (!geometry.getAttribute("uv1")) {
            geometry.setAttribute("uv1", uv.clone());
        }

        if (!geometry.getAttribute("uv2")) {
            geometry.setAttribute("uv2", uv.clone());
        }
    }

    _prepareModel(model) {
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
            "./assets/models/environment/flak18/flak18.glb",

            (gltf) => {
                this.model = gltf.scene;

                this._prepareModel(this.model);

                this.yawPivot = this.model.getObjectByName("YawPivot");
                this.pitchPivot = this.model.getObjectByName("PitchPivot");
                this.muzzle = this.model.getObjectByName("Muzzle");
                this.muzzleForward = this.model.getObjectByName("MuzzleForward");

                if (!this.yawPivot) console.error("Flak18: YawPivot not found.");
                if (!this.pitchPivot) console.error("Flak18: PitchPivot not found.");
                if (!this.muzzle) console.error("Flak18: Muzzle not found.");
                if (!this.muzzleForward) console.error("Flak18: MuzzleForward not found.");

                this.root.add(this.model);

                this.root.updateWorldMatrix(true, true);

                this.bounds.setFromObject(this.root, true);
                this.bounds.getSize(this.boundsSize);

                this.loaded = true;

                console.log(
                    `Flak18 loaded: size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
                );

                console.log(
                    `Flak18 hierarchy: yaw=${!!this.yawPivot}, pitch=${!!this.pitchPivot}, muzzle=${!!this.muzzle}`
                );

                if (this.debugVisible) {
                    this._createBoundsHelper();
                }
            },

            undefined,

            (error) => {
                console.error("Error loading Flak18:", error);
            }
        );
    }

    setTargetAngles(yawDeg, pitchDeg) {
        this.targetYaw = THREE.MathUtils.degToRad(yawDeg);

        this.targetPitch = THREE.MathUtils.clamp(
            THREE.MathUtils.degToRad(pitchDeg),
            this.minPitch,
            this.maxPitch
        );
    }

    setAngles(yawDeg, pitchDeg) {
        this.yaw = THREE.MathUtils.degToRad(yawDeg);

        this.pitch = THREE.MathUtils.clamp(
            THREE.MathUtils.degToRad(pitchDeg),
            this.minPitch,
            this.maxPitch
        );

        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;

        this._applyAngles();
    }

    _moveAngle(current, target, maxStep) {
        let delta = THREE.MathUtils.euclideanModulo(
            target - current + Math.PI,
            Math.PI * 2
        ) - Math.PI;

        delta = THREE.MathUtils.clamp(delta, -maxStep, maxStep);

        return current + delta;
    }

    _applyAngles() {
        if (this.yawPivot) {
            this.yawPivot.rotation.y = this.yaw;
        }

        if (this.pitchPivot) {
            this.pitchPivot.rotation.z = this.pitch;
        }
    }

    update(deltaTime) {
        if (!this.loaded) return;

        this.yaw = this._moveAngle(
            this.yaw,
            this.targetYaw,
            this.yawSpeed * deltaTime
        );

        const pitchDelta = this.pitchSpeed * deltaTime;

        if (this.pitch < this.targetPitch) {
            this.pitch = Math.min(
                this.pitch + pitchDelta,
                this.targetPitch
            );
        } else {
            this.pitch = Math.max(
                this.pitch - pitchDelta,
                this.targetPitch
            );
        }

        this._applyAngles();
    }

    getMuzzleWorldPosition(target = new THREE.Vector3()) {
        if (!this.muzzle) return target.copy(this.root.position);

        return this.muzzle.getWorldPosition(target);
    }

    getMuzzleWorldDirection(target = new THREE.Vector3()) {
        if (!this.muzzle || !this.muzzleForward) {
            return target.set(1, 0, 0);
        }

        const p0 = this.muzzle.getWorldPosition(new THREE.Vector3());
        const p1 = this.muzzleForward.getWorldPosition(new THREE.Vector3());

        return target.subVectors(p1, p0).normalize();
    }

    _createBoundsHelper() {
        if (this.boundsHelper) {
            this.scene.remove(this.boundsHelper);
        }

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