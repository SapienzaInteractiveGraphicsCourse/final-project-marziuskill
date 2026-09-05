//DEPENDENCIES
import * as THREE from "three";

//ANIMATION STATE
const Phase = Object.freeze({
    IDLE: "IDLE",
    ENTER: "ENTER",
    FIELD: "FIELD",
    RETURN: "RETURN",
    HOLD: "HOLD",
    EXIT_RACK: "EXIT_RACK",
    CUE_ENTER: "CUE_ENTER",
    CUE_DROP: "CUE_DROP",
    CUE_EXIT: "CUE_EXIT"
});

//HELPERS
function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}
function smoothstep01(value) {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
}
function smootherstep01(value) {
    const x = clamp01(value);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

//RACK RESET
export class RackResetAnimator {
    constructor({ scene, rackObject, cueBallVisual, cueBallBody, objectBallBodies, cueBallStartPosition, objectBallStartPositions, clothY, ballRadius, finalizeReset }) {
        this.scene = scene;
        this.cueBallVisual = cueBallVisual;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.cueBallStartPosition = cueBallStartPosition.clone();
        this.objectBallStartPositions = objectBallStartPositions.map(p => p.clone());
        this.clothY = clothY;
        this.ballRadius = ballRadius;
        this.finalizeReset = finalizeReset;
        this.phase = Phase.IDLE;
        this.time = 0;
        this.completedPulse = false;
        this.enterDuration = 0.92;
        this.fieldDuration = 0.34;
        this.returnDuration = 2.10;
        this.holdDuration = 0.28;
        this.exitRackDuration = 0.88;
        this.cueEnterDuration = 0.88;
        this.cueDropDuration = 0.78;
        this.cueExitDuration = 0.72;
        this.hoverHeight = 0.205;
        this.startHeight = 0.64;
        this.fieldHeight = 0.20;
        this.root = new THREE.Group();
        this.root.name = "GhostRackResetVFX";
        this.root.visible = false;
        this.scene.add(this.root);
        this.rack = rackObject;
        this.rack.name = "GhostRack";
        this.rackMaterials = [];
        this.#prepareGhostRack();
        this.root.add(this.rack);
        this.cueBallMaterials = [];
        this.#prepareCueBallVisual();
        this.rackCenter = this.#computeRackCenter();
        this.approachDirection = this.#computeApproachDirection();
        const baseYaw = Math.atan2(this.approachDirection.x, this.approachDirection.z);
        this.orientationYaw = baseYaw - Math.PI / 2;
        this.rackRadius = this.#computeRackRadius();
        this.prism = this.#createPrism();
        this.scene.add(this.prism);
        this.light = new THREE.PointLight(0x65d9ff, 0, 2.8, 2.0);
        this.light.position.copy(this.rackCenter);
        this.light.position.y = this.clothY + 0.22;
        this.scene.add(this.light);
        this.objectTracks = [];
        this.cueCaptureStart = null;
    }
    #prepareGhostRack() {
        this.rack.position.set(0, 0, 0);
        this.rack.traverse(child => {
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
                if ("emissive" in copy && copy.emissive) {
                    copy.emissive.set(0x133544);
                    copy.emissiveIntensity = 0.60;
                }
                this.rackMaterials.push(copy);
                return copy;
            };
            child.material = Array.isArray(child.material) ? child.material.map(ghostify) : ghostify(child.material);
        });
        this.rack.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.rack);
        const center = box.getCenter(new THREE.Vector3());
        this.rack.position.x -= center.x;
        this.rack.position.z -= center.z;
        this.rack.position.y -= box.min.y;
    }
    #prepareCueBallVisual() {
        if (!this.cueBallVisual?.traverse) {
            return;
        }
        this.cueBallVisual.traverse(child => {
            if (!child.isMesh || !child.material) {
                return;
            }
            const makeFadeMaterial = material => {
                const copy = material.clone();
                copy.transparent = true;
                copy.opacity = 1;
                copy.depthWrite = true;
                this.cueBallMaterials.push(copy);
                return copy;
            };
            child.material = Array.isArray(child.material) ? child.material.map(makeFadeMaterial) : makeFadeMaterial(child.material);
        });
    }
    #computeRackCenter() {
        const center = new THREE.Vector3();
        for (const p of this.objectBallStartPositions) {
            center.add(p);
        }
        center.multiplyScalar(1 / Math.max(1, this.objectBallStartPositions.length));
        center.y = this.clothY;
        return center;
    }
    #computeApproachDirection() {
        const direction = this.cueBallStartPosition.clone().sub(this.rackCenter);
        direction.y = 0;
        if (direction.lengthSq() < 1e-8) {
            direction.set(1, 0, 0);
        }
        else {
            direction.normalize();
        }
        return direction;
    }
    #computeRackRadius() {
        let maxDistance = 0;
        for (const p of this.objectBallStartPositions) {
            const dx = p.x - this.rackCenter.x;
            const dz = p.z - this.rackCenter.z;
            maxDistance = Math.max(maxDistance, Math.hypot(dx, dz));
        }
        return Math.max(0.17, maxDistance + this.ballRadius * 1.6);
    }
    #createPrism() {
        const group = new THREE.Group();
        group.name = "GhostRackTriangularField";
        group.visible = false;
        group.renderOrder = 80;
        const shellGeometry = new THREE.CylinderGeometry(this.rackRadius, this.rackRadius, this.fieldHeight, 3, 1, false);
        const shellMaterial = new THREE.MeshBasicMaterial({
            color: 0x58d8ff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const shell = new THREE.Mesh(shellGeometry, shellMaterial);
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
        group.position.copy(this.rackCenter);
        group.position.y = this.clothY + this.fieldHeight * 0.5 + 0.01;
        group.scale.y = 0.001;
        return group;
    }
    #setRackOpacity(value) {
        const opacity = clamp01(value);
        for (const material of this.rackMaterials) {
            material.opacity = opacity * 0.84;
            material.needsUpdate = true;
        }
    }
    #setCueOpacity(value) {
        const opacity = clamp01(value);
        for (const material of this.cueBallMaterials) {
            material.opacity = opacity;
            material.depthWrite = opacity > 0.98;
            material.needsUpdate = true;
        }
    }
    #setField(amount, center = this.rackCenter) {
        const t = clamp01(amount);
        this.prism.visible = t > 0.001;
        this.prism.position.x = center.x;
        this.prism.position.z = center.z;
        this.prism.rotation.y = Math.PI;
        this.prism.scale.y = Math.max(0.001, t);
        this.prism.position.y = this.clothY + 0.012 + this.fieldHeight - this.fieldHeight * t * 0.5;
        this.prism.userData.shell.material.opacity = 0.14 * t;
        this.prism.userData.edges.material.opacity = 0.55 * t;
        this.light.intensity = 18 * t;
    }
    #setRootPose(center, y) {
        this.root.position.set(center.x, y, center.z);
        this.root.rotation.set(0, this.orientationYaw, 0);
        this.light.position.x = center.x;
        this.light.position.z = center.z;
        this.light.position.y = Math.max(this.clothY + 0.18, y + 0.05);
    }
    #resetBodyMotion(body) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }
    #buildTracks() {
        this.objectTracks = this.objectBallBodies.map((body, index) => {
            const start = body.position.clone();
            start.y = this.clothY + this.ballRadius;
            const target = this.objectBallStartPositions[index].clone();
            target.y = this.clothY + this.ballRadius;
            const straight = target.clone().sub(start);
            straight.y = 0;
            const length = straight.length();
            const perpendicular = length > 1e-7 ? new THREE.Vector3(-straight.z, 0, straight.x).normalize() : new THREE.Vector3(1, 0, 0);
            const signedCurve = ((index % 3) - 1) * Math.min(0.06, length * 0.11);
            this.#resetBodyMotion(body);
            return {
                body,
                start,
                target,
                previous: start.clone(),
                perpendicular,
                signedCurve,
                delay: 0.04 + ((index * 7) % 11) * 0.012
            };
        });
        this.cueCaptureStart = this.cueBallBody.position.clone();
        this.cueCaptureStart.y = this.clothY + this.ballRadius;
        this.#resetBodyMotion(this.cueBallBody);
    }
    #updateRollingTrack(track, localT) {
        const t = smootherstep01(localT);
        const position = track.start.clone().lerp(track.target, t);
        position.addScaledVector(track.perpendicular, Math.sin(Math.PI * t) * track.signedCurve);
        position.y = this.clothY + this.ballRadius;
        const delta = position.clone().sub(track.previous);
        delta.y = 0;
        const distance = delta.length();
        if (distance > 1e-7) {
            const direction = delta.multiplyScalar(1 / distance);
            const axis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
            const dq = new THREE.Quaternion().setFromAxisAngle(axis, distance / Math.max(1e-6, this.ballRadius));
            track.body.orientation.premultiply(dq).normalize();
        }
        track.body.position.copy(position);
        this.#resetBodyMotion(track.body);
        track.previous.copy(position);
    }
    #updateCueCapture(localT) {
        const t = smootherstep01(localT);
        const rackY = this.clothY + this.hoverHeight;
        const target = new THREE.Vector3(this.rackCenter.x, rackY, this.rackCenter.z);
        const position = this.cueCaptureStart.clone().lerp(target, t);
        position.y = THREE.MathUtils.lerp(this.clothY + this.ballRadius, rackY, t);
        this.cueBallBody.position.copy(position);
        this.#resetBodyMotion(this.cueBallBody);
    }
    #pinObjectBallsToTargets() {
        for (let i = 0; i < this.objectBallBodies.length; i += 1) {
            this.objectBallBodies[i].position.copy(this.objectBallStartPositions[i]);
            this.objectBallBodies[i].position.y = this.clothY + this.ballRadius;
            this.#resetBodyMotion(this.objectBallBodies[i]);
        }
    }
    start() {
        if (this.phase !== Phase.IDLE) {
            return false;
        }
        this.completedPulse = false;
        this.time = 0;
        this.phase = Phase.ENTER;
        this.root.visible = true;
        this.prism.visible = false;
        this.#setRootPose(this.rackCenter, this.clothY + this.startHeight);
        this.#setRackOpacity(0);
        this.#setCueOpacity(1);
        this.#setField(0, this.rackCenter);
        this.#buildTracks();
        return true;
    }
    isBusy() {
        return this.phase !== Phase.IDLE;
    }
    cancel(finalize = false) {
        if (this.phase === Phase.IDLE) {
            return;
        }
        if (finalize) {
            this.finalizeReset?.();
        }
        this.root.visible = false;
        this.prism.visible = false;
        this.#setField(0);
        this.#setRackOpacity(0);
        this.#setCueOpacity(1);
        this.phase = Phase.IDLE;
        this.time = 0;
        this.completedPulse = false;
    }
    consumeCompletedPulse() {
        const value = this.completedPulse;
        this.completedPulse = false;
        return value;
    }
    update(dt) {
        if (this.phase === Phase.IDLE) {
            return;
        }
        this.time += dt;
        if (this.phase === Phase.ENTER) {
            const t = smoothstep01(this.time / this.enterDuration);
            this.#setRootPose(this.rackCenter, THREE.MathUtils.lerp(this.clothY + this.startHeight, this.clothY + this.hoverHeight, t));
            this.#setRackOpacity(t);
            this.#setCueOpacity(1);
            this.#setField(0, this.rackCenter);
            if (this.time >= this.enterDuration) {
                this.time = 0;
                this.phase = Phase.FIELD;
            }
            return;
        }
        if (this.phase === Phase.FIELD) {
            const t = smoothstep01(this.time / this.fieldDuration);
            this.#setRootPose(this.rackCenter, this.clothY + this.hoverHeight);
            this.#setRackOpacity(1);
            this.#setCueOpacity(1);
            this.#setField(t, this.rackCenter);
            if (this.time >= this.fieldDuration) {
                this.time = 0;
                this.phase = Phase.RETURN;
            }
            return;
        }
        if (this.phase === Phase.RETURN) {
            const raw = clamp01(this.time / this.returnDuration);
            this.#setRootPose(this.rackCenter, this.clothY + this.hoverHeight);
            this.#setRackOpacity(1);
            this.#setCueOpacity(1);
            this.#setField(1, this.rackCenter);
            for (const track of this.objectTracks) {
                const local = clamp01((raw - track.delay) / Math.max(0.001, 1 - track.delay));
                this.#updateRollingTrack(track, local);
            }
            this.#updateCueCapture(raw);
            const pulse = 0.92 + 0.08 * Math.sin(this.time * 8.0);
            this.light.intensity = 18 * pulse;
            if (this.time >= this.returnDuration) {
                for (const track of this.objectTracks) {
                    this.#updateRollingTrack(track, 1);
                }
                this.#updateCueCapture(1);
                this.time = 0;
                this.phase = Phase.HOLD;
            }
            return;
        }
        if (this.phase === Phase.HOLD) {
            this.#setRootPose(this.rackCenter, this.clothY + this.hoverHeight);
            this.#setRackOpacity(1);
            this.#setCueOpacity(1);
            this.#setField(1, this.rackCenter);
            this.#pinObjectBallsToTargets();
            this.#updateCueCapture(1);
            if (this.time >= this.holdDuration) {
                this.time = 0;
                this.phase = Phase.EXIT_RACK;
            }
            return;
        }
        if (this.phase === Phase.EXIT_RACK) {
            const t = smoothstep01(this.time / this.exitRackDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.hoverHeight, this.clothY + this.startHeight, t);
            this.#setRootPose(this.rackCenter, y);
            this.#setRackOpacity(1 - t);
            this.#setCueOpacity(1 - t);
            this.#setField(1 - t, this.rackCenter);
            this.#pinObjectBallsToTargets();
            this.cueBallBody.position.set(this.rackCenter.x, y, this.rackCenter.z);
            this.#resetBodyMotion(this.cueBallBody);
            if (this.time >= this.exitRackDuration) {
                this.time = 0;
                this.phase = Phase.CUE_ENTER;
            }
            return;
        }
        if (this.phase === Phase.CUE_ENTER) {
            const t = smoothstep01(this.time / this.cueEnterDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.startHeight, this.clothY + this.hoverHeight, t);
            this.#setRootPose(this.cueBallStartPosition, y);
            this.#setRackOpacity(t);
            this.#setCueOpacity(t);
            this.#setField(t * 0.85, this.cueBallStartPosition);
            this.#pinObjectBallsToTargets();
            this.cueBallBody.position.set(this.cueBallStartPosition.x, y, this.cueBallStartPosition.z);
            this.#resetBodyMotion(this.cueBallBody);
            if (this.time >= this.cueEnterDuration) {
                this.time = 0;
                this.phase = Phase.CUE_DROP;
            }
            return;
        }
        if (this.phase === Phase.CUE_DROP) {
            const t = smootherstep01(this.time / this.cueDropDuration);
            this.#setRootPose(this.cueBallStartPosition, this.clothY + this.hoverHeight);
            this.#setRackOpacity(1);
            this.#setCueOpacity(1);
            this.#setField(0.85, this.cueBallStartPosition);
            this.#pinObjectBallsToTargets();
            this.cueBallBody.position.set(this.cueBallStartPosition.x, THREE.MathUtils.lerp(this.clothY + this.hoverHeight, this.clothY + this.ballRadius, t), this.cueBallStartPosition.z);
            this.#resetBodyMotion(this.cueBallBody);
            if (this.time >= this.cueDropDuration) {
                this.time = 0;
                this.phase = Phase.CUE_EXIT;
            }
            return;
        }
        if (this.phase === Phase.CUE_EXIT) {
            const t = smoothstep01(this.time / this.cueExitDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.hoverHeight, this.clothY + this.startHeight, t);
            this.#setRootPose(this.cueBallStartPosition, y);
            this.#setRackOpacity(1 - t);
            this.#setCueOpacity(1);
            this.#setField(0.85 * (1 - t), this.cueBallStartPosition);
            this.#pinObjectBallsToTargets();
            this.cueBallBody.position.set(this.cueBallStartPosition.x, this.clothY + this.ballRadius, this.cueBallStartPosition.z);
            this.#resetBodyMotion(this.cueBallBody);
            if (this.time >= this.cueExitDuration) {
                this.finalizeReset?.();
                this.root.visible = false;
                this.prism.visible = false;
                this.#setField(0, this.cueBallStartPosition);
                this.#setRackOpacity(0);
                this.#setCueOpacity(1);
                this.phase = Phase.IDLE;
                this.time = 0;
                this.completedPulse = true;
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
        for (const material of this.rackMaterials) {
            material.dispose?.();
        }
        for (const material of this.cueBallMaterials) {
            material.dispose?.();
        }
    }
}
