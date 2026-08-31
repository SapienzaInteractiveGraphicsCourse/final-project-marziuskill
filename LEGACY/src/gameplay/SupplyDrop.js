import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class SupplyDrop {
    constructor(scene, {
        position = new THREE.Vector3(),
        velocity = new THREE.Vector3(),
        crateModelPath = null
    } = {}) {
        this.scene = scene;
        this.velocity = velocity.clone();

        this.state = "freefall";
        this.age = 0;
        this.deployProgress = 0;

        this.deployDelay = 0.65;
        this.deployDuration = 0.55;

        this.gravity = 10;
        this.parachuteSinkSpeed = 4.2;
        this.horizontalDrag = 0.7;
        this.groundOffset = 0.7;

        this.landed = false;
        this.resolved = false;

        this.root = new THREE.Group();
        this.root.position.copy(position);
        this.scene.add(this.root);

        this.crateHolder = new THREE.Group();
        this.root.add(this.crateHolder);

        this._createCrate(crateModelPath);
        this._createParachute();
    }

    _createCrate(modelPath) {
        const fallback = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 1.4, 1.4),
            new THREE.MeshStandardMaterial({
                color: 0x6b4930,
                roughness: 0.85
            })
        );

        fallback.castShadow = true;
        fallback.receiveShadow = true;
        this.crateHolder.add(fallback);

        if (!modelPath) return;

        const loader = new GLTFLoader();

        loader.load(
            modelPath,
            (gltf) => {
                this.crateHolder.clear();

                const crate = gltf.scene;
                crate.scale.setScalar(1);

                crate.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.crateHolder.add(crate);
            },
            undefined,
            (error) => {
                console.warn("Could not load supply crate model. Using fallback crate.", error);
            }
        );
    }

    _createParachute() {
        this.parachute = new THREE.Group();
        this.parachute.position.y = 3.4;
        this.root.add(this.parachute);

        const canopyGeometry = new THREE.SphereGeometry(
            2.2,
            24,
            12,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        );

        const canopyMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b9460,
            roughness: 0.9,
            side: THREE.DoubleSide
        });

        this.canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        this.canopy.castShadow = true;
        this.parachute.add(this.canopy);

        this.linePositions = new Float32Array(24);

        this.lineGeometry = new THREE.BufferGeometry();
        this.lineGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(this.linePositions, 3)
        );

        this.lines = new THREE.LineSegments(
            this.lineGeometry,
            new THREE.LineBasicMaterial({color: 0x44372b})
        );

        this.root.add(this.lines);

        this.parachute.visible = false;
        this.lines.visible = false;

        this.parachute.scale.setScalar(0.05);
    }

    _updateLines(scale) {
        const crateY = 0.65;
        const canopyY = 3.4;
        const crateSize = 0.55;
        const canopySize = 1.55 * scale;

        const points = [
            [-crateSize, crateY, -crateSize, -canopySize, canopyY, -canopySize],
            [ crateSize, crateY, -crateSize,  canopySize, canopyY, -canopySize],
            [-crateSize, crateY,  crateSize, -canopySize, canopyY,  canopySize],
            [ crateSize, crateY,  crateSize,  canopySize, canopyY,  canopySize]
        ];

        let i = 0;

        for (const point of points) {
            for (const value of point) {
                this.linePositions[i++] = value;
            }
        }

        this.lineGeometry.attributes.position.needsUpdate = true;
    }

    _beginDeployment() {
        this.state = "deploying";
        this.deployProgress = 0;

        this.parachute.visible = true;
        this.lines.visible = true;
    }

    _updateFreefall(deltaTime) {
        this.velocity.y -= this.gravity * deltaTime;

        this.crateHolder.rotation.x += 1.2 * deltaTime;
        this.crateHolder.rotation.z += 0.8 * deltaTime;

        if (this.age >= this.deployDelay) {
            this._beginDeployment();
        }
    }

    _updateDeployment(deltaTime) {
        this.deployProgress = THREE.MathUtils.clamp(
            this.deployProgress + deltaTime / this.deployDuration,
            0,
            1
        );

        const t = THREE.MathUtils.smoothstep(this.deployProgress, 0, 1);
        const scale = THREE.MathUtils.lerp(0.05, 1, t);

        this.parachute.scale.setScalar(scale);
        this._updateLines(scale);

        this.velocity.y -= this.gravity * (1 - t) * deltaTime;

        const response = 1 - Math.exp(-4 * t * deltaTime);
        this.velocity.y = THREE.MathUtils.lerp(
            this.velocity.y,
            -this.parachuteSinkSpeed,
            response
        );

        const horizontalDamping = Math.exp(-this.horizontalDrag * t * deltaTime);
        this.velocity.x *= horizontalDamping;
        this.velocity.z *= horizontalDamping;

        if (this.deployProgress >= 1) {
            this.state = "parachuting";
        }
    }

    _updateParachuting(deltaTime) {
        const response = 1 - Math.exp(-4 * deltaTime);

        this.velocity.y = THREE.MathUtils.lerp(
            this.velocity.y,
            -this.parachuteSinkSpeed,
            response
        );

        const horizontalDamping = Math.exp(-this.horizontalDrag * deltaTime);
        this.velocity.x *= horizontalDamping;
        this.velocity.z *= horizontalDamping;

        this._updateLines(1);
    }

    update(deltaTime, surfaceHeight) {
        if (this.landed) return false;

        this.age += deltaTime;

        if (this.state === "freefall") {
            this._updateFreefall(deltaTime);
        } else if (this.state === "deploying") {
            this._updateDeployment(deltaTime);
        } else if (this.state === "parachuting") {
            this._updateParachuting(deltaTime);
        }

        this.root.position.addScaledVector(this.velocity, deltaTime);

        if (this.root.position.y - this.groundOffset <= surfaceHeight) {
            this.root.position.y = surfaceHeight + this.groundOffset;
            this.velocity.set(0, 0, 0);

            this.state = "landed";
            this.landed = true;

            this.parachute.visible = false;
            this.lines.visible = false;

            return true;
        }

        return false;
    }

    getPosition() {
        return this.root.position;
    }

    getObject3D() {
        return this.root;
    }

    isLanded() {
        return this.landed;
    }
}