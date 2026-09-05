//DEPENDENCIES
import * as THREE from "three";

//ANIMATION STATE
const Phase = Object.freeze({
    IDLE: "IDLE",
    ENTER_SOURCE: "ENTER_SOURCE",
    CAPTURE: "CAPTURE",
    EXIT_SOURCE: "EXIT_SOURCE",
    ENTER_TARGET: "ENTER_TARGET",
    DROP: "DROP",
    EXIT_TARGET: "EXIT_TARGET"
});

//HELPERS
function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}
function smooth01(value) {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
}

//PLACEMENT ANIMATION
export class CueBallPlacementAnimator {
    constructor({ scene, triangleObject, cueBallVisual, cueBallBody, cueBallStartPosition, clothY, ballRadius, finalizePlacement = null }) {
        this.scene = scene;
        this.cueBallVisual = cueBallVisual;
        this.cueBallBody = cueBallBody;
        this.cueBallStartPosition = cueBallStartPosition.clone();
        this.clothY = clothY;
        this.ballRadius = ballRadius;
        this.finalizePlacement = finalizePlacement;
        this.phase = Phase.IDLE;
        this.time = 0;
        this.afterComplete = null;
        this.mode = "RELEASE_ONLY";
        this.enterDuration = 0.66;
        this.captureDuration = 0.72;
        this.exitSourceDuration = 0.58;
        this.enterTargetDuration = 0.60;
        this.dropDuration = 0.62;
        this.exitTargetDuration = 0.52;
        this.startHeight = 0.58;
        this.hoverHeight = 0.19;
        this.captureHeight = this.clothY + 0.19;
        this.releaseHeight = this.clothY + 0.19;
        this.fieldHeight = 0.18;
        this.fieldRadius = Math.max(0.12, this.ballRadius * 5.5);
        this.root = new THREE.Group();
        this.root.name = "CueBallPlacementVFX";
        this.root.visible = false;
        this.scene.add(this.root);
        this.triangle = triangleObject;
        this.triangle.name = "CueBallPlacementTriangle";
        this.triangleMaterials = [];
        this.#prepareTriangle();
        this.root.add(this.triangle);
        this.cueBallMaterials = [];
        this.#prepareCueBallVisual();
        this.prism = this.#createPrism();
        this.scene.add(this.prism);
        this.light = new THREE.PointLight(0x65d9ff, 0, 2.4, 2.0);
        this.scene.add(this.light);
        this.sourceCenter = this.cueBallStartPosition.clone();
        this.targetCenter = this.cueBallStartPosition.clone();
        this.orientationYaw = 0;
    }
    #prepareTriangle() {
        this.triangle.position.set(0, 0, 0);
        this.triangle.traverse(child => {
            if (!child.isMesh || !child.material) {
                return;
            }
            const ghostify = material => {
                const copy = material.clone();
                copy.transparent = true;
                copy.opacity = 0;
                copy.depthWrite = false;
                if (copy.color) {
                    copy.color.multiplyScalar(0.12);
                }
                if (copy.emissive) {
                    copy.emissive.set(0x133544);
                    copy.emissiveIntensity = 0.58;
                }
                this.triangleMaterials.push(copy);
                return copy;
            };
            child.material = Array.isArray(child.material) ? child.material.map(ghostify) : ghostify(child.material);
        });
        this.triangle.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.triangle);
        const center = box.getCenter(new THREE.Vector3());
        this.triangle.position.x -= center.x;
        this.triangle.position.z -= center.z;
        this.triangle.position.y -= box.min.y;
    }
    #prepareCueBallVisual() {
        if (!this.cueBallVisual?.traverse) {
            return;
        }
        this.cueBallVisual.traverse(child => {
            if (!child.isMesh || !child.material) {
                return;
            }
            const cloneFade = material => {
                const copy = material.clone();
                copy.transparent = true;
                copy.opacity = 1;
                this.cueBallMaterials.push(copy);
                return copy;
            };
            child.material = Array.isArray(child.material) ? child.material.map(cloneFade) : cloneFade(child.material);
        });
    }
    #createPrism() {
        const group = new THREE.Group();
        group.name = "CueBallPlacementField";
        group.visible = false;
        const shellGeometry = new THREE.CylinderGeometry(this.fieldRadius, this.fieldRadius, this.fieldHeight, 3, 1, false);
        const shell = new THREE.Mesh(shellGeometry, new THREE.MeshBasicMaterial({
            color: 0x58d8ff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        group.add(shell);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry), new THREE.LineBasicMaterial({
            color: 0xc4f0ff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        group.add(edges);
        group.userData.shell = shell;
        group.userData.edges = edges;
        return group;
    }
    #setTriangleOpacity(value) {
        const opacity = clamp01(value);
        for (const material of this.triangleMaterials) {
            material.opacity = opacity * 0.84;
            material.needsUpdate = true;
        }
    }
    #setCueOpacity(value) {
        const opacity = clamp01(value);
        for (const material of this.cueBallMaterials) {
            material.opacity = opacity;
            material.transparent = opacity < 0.999;
            material.needsUpdate = true;
        }
    }
    #setField(amount, center) {
        const t = clamp01(amount);
        this.prism.visible = t > 0.001;
        this.prism.position.set(center.x, this.clothY + 0.01 + this.fieldHeight - this.fieldHeight * t * 0.5, center.z);
        this.prism.rotation.set(0, Math.PI, 0);
        this.prism.scale.set(1, Math.max(0.001, t), 1);
        this.prism.userData.shell.material.opacity = 0.13 * t;
        this.prism.userData.edges.material.opacity = 0.52 * t;
        this.light.position.set(center.x, this.clothY + 0.21, center.z);
        this.light.intensity = 16 * t;
    }
    #setRootPose(center, y) {
        this.root.position.set(center.x, y, center.z);
        this.root.rotation.set(0, this.orientationYaw, 0);
    }
    #stopCueBody() {
        this.cueBallBody.velocity.set(0, 0, 0);
        this.cueBallBody.angularVelocity.set(0, 0, 0);
    }
    start({ mode = "RELEASE_ONLY", sourcePosition = null, targetPosition = null, onComplete = null }) {
        if (this.phase !== Phase.IDLE) {
            return false;
        }
        this.mode = mode;
        this.afterComplete = onComplete;
        this.targetCenter = (targetPosition ?? this.cueBallStartPosition).clone();
        this.targetCenter.y = this.clothY;
        this.sourceCenter = (sourcePosition ?? this.cueBallBody.position).clone();
        this.sourceCenter.y = this.clothY;
        const direction = this.targetCenter.clone().sub(this.sourceCenter);
        direction.y = 0;
        if (direction.lengthSq() < 1e-8) {
            direction.set(1, 0, 0);
        }
        else {
            direction.normalize();
        }
        const baseYaw = Math.atan2(direction.x, direction.z);
        this.orientationYaw = baseYaw - Math.PI / 2;
        this.captureStartPosition = this.cueBallBody.position.clone();
        this.phase = mode === "COLLECT_AND_RELEASE" ? Phase.ENTER_SOURCE : Phase.ENTER_TARGET;
        this.time = 0;
        this.root.visible = true;
        this.prism.visible = false;
        this.#setTriangleOpacity(0);
        this.#setCueOpacity(mode === "COLLECT_AND_RELEASE" ? 1 : 0);
        this.#setField(0, this.phase === Phase.ENTER_TARGET ? this.targetCenter : this.sourceCenter);
        return true;
    }
    isBusy() {
        return this.phase !== Phase.IDLE;
    }
    cancel() {
        this.phase = Phase.IDLE;
        this.time = 0;
        this.root.visible = false;
        this.prism.visible = false;
        this.light.intensity = 0;
        this.#setTriangleOpacity(0);
        this.#setField(0, this.targetCenter);
        this.#setCueOpacity(1);
        this.afterComplete = null;
    }
    update(dt) {
        if (this.phase === Phase.IDLE) {
            return;
        }
        this.time += dt;
        if (this.phase === Phase.ENTER_SOURCE) {
            const t = smooth01(this.time / this.enterDuration);
            this.#setRootPose(this.sourceCenter, THREE.MathUtils.lerp(this.clothY + this.startHeight, this.clothY + this.hoverHeight, t));
            this.#setTriangleOpacity(t);
            this.#setField(t, this.sourceCenter);
            this.#setCueOpacity(1);
            this.#stopCueBody();
            this.cueBallBody.position.y = this.clothY + this.ballRadius;
            if (this.time >= this.enterDuration) {
                this.phase = Phase.CAPTURE;
                this.time = 0;
            }
            return;
        }
        if (this.phase === Phase.CAPTURE) {
            const t = smooth01(this.time / this.captureDuration);
            this.cueBallBody.position.lerpVectors(this.captureStartPosition, new THREE.Vector3(this.sourceCenter.x, this.captureHeight, this.sourceCenter.z), t);
            this.#stopCueBody();
            this.#setRootPose(this.sourceCenter, this.clothY + this.hoverHeight);
            this.#setTriangleOpacity(1);
            this.#setCueOpacity(1);
            this.#setField(1, this.sourceCenter);
            if (this.time >= this.captureDuration) {
                this.phase = Phase.EXIT_SOURCE;
                this.time = 0;
            }
            return;
        }
        if (this.phase === Phase.EXIT_SOURCE) {
            const t = smooth01(this.time / this.exitSourceDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.hoverHeight, this.clothY + this.startHeight, t);
            const cueY = THREE.MathUtils.lerp(this.captureHeight, this.clothY + this.startHeight, t);
            this.#setRootPose(this.sourceCenter, y);
            this.#setTriangleOpacity(1 - t);
            this.#setCueOpacity(1 - t);
            this.#setField(1 - t, this.sourceCenter);
            this.cueBallBody.position.set(this.sourceCenter.x, cueY, this.sourceCenter.z);
            this.#stopCueBody();
            if (this.time >= this.exitSourceDuration) {
                this.phase = Phase.ENTER_TARGET;
                this.time = 0;
                this.#setCueOpacity(0);
            }
            return;
        }
        if (this.phase === Phase.ENTER_TARGET) {
            const t = smooth01(this.time / this.enterTargetDuration);
            this.#setRootPose(this.targetCenter, THREE.MathUtils.lerp(this.clothY + this.startHeight, this.clothY + this.hoverHeight, t));
            this.#setTriangleOpacity(t);
            this.#setField(t, this.targetCenter);
            this.cueBallBody.position.set(this.targetCenter.x, this.releaseHeight, this.targetCenter.z);
            this.#stopCueBody();
            this.#setCueOpacity(t);
            if (this.time >= this.enterTargetDuration) {
                this.phase = Phase.DROP;
                this.time = 0;
            }
            return;
        }
        if (this.phase === Phase.DROP) {
            const t = smooth01(this.time / this.dropDuration);
            this.#setRootPose(this.targetCenter, this.clothY + this.hoverHeight);
            this.#setTriangleOpacity(1);
            this.#setField(1, this.targetCenter);
            this.#setCueOpacity(1);
            this.cueBallBody.position.set(this.targetCenter.x, THREE.MathUtils.lerp(this.releaseHeight, this.clothY + this.ballRadius, t), this.targetCenter.z);
            this.#stopCueBody();
            if (this.time >= this.dropDuration) {
                this.phase = Phase.EXIT_TARGET;
                this.time = 0;
            }
            return;
        }
        if (this.phase === Phase.EXIT_TARGET) {
            const t = smooth01(this.time / this.exitTargetDuration);
            this.#setRootPose(this.targetCenter, THREE.MathUtils.lerp(this.clothY + this.hoverHeight, this.clothY + this.startHeight, t));
            this.#setTriangleOpacity(1 - t);
            this.#setField(1 - t, this.targetCenter);
            this.#setCueOpacity(1);
            this.cueBallBody.position.set(this.targetCenter.x, this.clothY + this.ballRadius, this.targetCenter.z);
            this.#stopCueBody();
            if (this.time >= this.exitTargetDuration) {
                this.phase = Phase.IDLE;
                this.time = 0;
                this.root.visible = false;
                this.prism.visible = false;
                this.light.intensity = 0;
                this.#setTriangleOpacity(0);
                this.#setField(0, this.targetCenter);
                this.#setCueOpacity(1);
                this.finalizePlacement?.();
                this.afterComplete?.();
                this.afterComplete = null;
            }
        }
    }
    dispose() {
        this.root.removeFromParent();
        this.prism.removeFromParent();
        this.light.removeFromParent();
        this.prism.traverse(child => {
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        });
        for (const material of this.triangleMaterials) {
            material.dispose?.();
        }
    }
}
