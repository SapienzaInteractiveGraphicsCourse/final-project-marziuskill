//Synchronizes the supernatural rack, prism and cue-ball reset animations.

//DEPENDENCIES
import * as THREE from "three";

//ANIMATION TYPES
export const TriangleAnimation = Object.freeze({
    RACK_RESET: "RACK_RESET",
    CUE_RECOVER: "CUE_RECOVER",
    CUE_RELEASE: "CUE_RELEASE"
});
const Phase = Object.freeze({
    IDLE: "IDLE",
    TRIANGLE_ENTER: "TRIANGLE_ENTER",
    PRISM_ENTER: "PRISM_ENTER",
    ACTION: "ACTION",
    HOLD: "HOLD",
    PRISM_EXIT: "PRISM_EXIT",
    TRIANGLE_EXIT: "TRIANGLE_EXIT"
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

//PRISM TUNING
const PRISM_PURPLE = 0xa35cff;

//TRIANGLE ANIMATION
export class TriangleAnimationSystem {

    //INITIALIZATION
    constructor({ scene, triangleObject, cueBallVisual, cueBallBody, objectBallBodies, cueBallStartPosition, objectBallStartPositions, clothY, ballRadius, finalizeRackReset = null, finalizeCueRelease = null, audioManager = null }) {
        this.scene = scene;
        this.cueBallVisual = cueBallVisual;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.cueBallStartPosition = cueBallStartPosition.clone();
        this.objectBallStartPositions = objectBallStartPositions.map(p => p.clone());
        this.clothY = clothY;
        this.ballRadius = ballRadius;
        this.finalizeRackReset = finalizeRackReset;
        this.finalizeCueRelease = finalizeCueRelease;
        this.audioManager = audioManager;
        this.phase = Phase.IDLE;
        this.time = 0;
        this.queue = [];
        this.current = null;
        this.sequenceComplete = null;
        this.enterDuration = 0.78;
        this.fieldDuration = 0.30;
        this.rackReturnDuration = 1.85;
        this.cueRecoverDuration = 0.72;
        this.cueReleaseDuration = 0.68;
        this.holdDuration = 0.20;
        this.exitDuration = 0.72;
        this.hoverOffset = 0.205;
        this.startOffset = 0.64;
        this.fieldHeight = 0.20;
        this.root = new THREE.Group();
        this.root.name = "TriangleAnimationVFX";
        this.root.visible = false;
        this.scene.add(this.root);
        this.triangle = triangleObject;
        this.triangle.name = "GhostTriangle";
        this.triangleMaterials = [];
        this.#prepareTriangle();
        this.root.add(this.triangle);
        this.cueBallMaterials = [];
        this.#prepareCueBallVisual();
        this.rackCenter = this.#computeRackCenter();
        this.rackRadius = this.#computeRackRadius();
        this.prism = this.#createPrism();
        this.scene.add(this.prism);
        this.light = new THREE.PointLight(PRISM_PURPLE, 0, 2.8, 2.0);
        this.scene.add(this.light);
        this.wispGeometry = new THREE.SphereGeometry(1, 10, 8);
        this.objectTracks = [];
        this.cueActionStart = null;
        this.actionCenter = this.rackCenter.clone();
        this.actionTarget = this.cueBallStartPosition.clone();
        this.triangleYaw = 0;
        const calibratedTriangleYaw = this.#yawForAction(this.rackCenter, this.cueBallStartPosition);
        this.prismYawOffset = Math.PI - calibratedTriangleYaw;
        this.prismWisps = [];
        this.prismSpawnAccumulator = 0;
        this.triangleSoundHandle = null;
    }

    //AUDIO
    #audioPosition() {
        return new THREE.Vector3(this.actionCenter.x, this.clothY + this.hoverOffset, this.actionCenter.z);
    }
    //Audio is fitted to the original visual duration; the animation timing remains authoritative.
    #playTriangleSound(name) {
        this.triangleSoundHandle?.stop?.({ fadeOut: 0.04 });
        this.triangleSoundHandle = this.audioManager?.play?.(name, {
            position: this.#audioPosition(),
            gain: 0.66,
            refDistance: 0.85,
            maxDistance: 11,
            rolloffFactor: 1.08
        }) ?? null;
    }

    //VISUAL SETUP
    #prepareTriangle() {
        this.triangle.position.set(0, 0, 0);
        this.triangle.traverse(child => {
            if (!child.isMesh || !child.material) {
                return;
            }
            const fadeClone = material => {
                const copy = material.clone();
                copy.userData.triangleBaseOpacity = material.opacity ?? 1;
                copy.userData.triangleBaseTransparent = material.transparent ?? false;
                copy.userData.triangleBaseDepthWrite = material.depthWrite ?? true;
                copy.transparent = true;
                copy.opacity = 0;
                copy.depthWrite = false;
                this.triangleMaterials.push(copy);
                return copy;
            };
            child.material = Array.isArray(child.material) ? child.material.map(fadeClone) : fadeClone(child.material);
        });
        this.triangle.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.triangle);
        const size = box.getSize(new THREE.Vector3());
        const optionA = [
            size.x / Math.sqrt(3),
            size.z / 1.5
        ];
        const optionB = [
            size.x / 1.5,
            size.z / Math.sqrt(3)
        ];
        const errorA = Math.abs(optionA[0] - optionA[1]);
        const errorB = Math.abs(optionB[0] - optionB[1]);
        const selected = errorA <= errorB ? optionA : optionB;
        this.prismRadius = Math.max(0.01, (selected[0] + selected[1]) * 0.5);
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
    #computeRackRadius() {
        let maxDistance = 0;
        for (const p of this.objectBallStartPositions) {
            maxDistance = Math.max(maxDistance, Math.hypot(p.x - this.rackCenter.x, p.z - this.rackCenter.z));
        }
        return Math.max(0.17, maxDistance + this.ballRadius * 1.6);
    }
    #createPrism() {
        const group = new THREE.Group();
        group.name = "TriangleEnergyPrism";
        group.visible = false;
        group.renderOrder = 80;
        const geometry = new THREE.CylinderGeometry(this.prismRadius, this.prismRadius, this.fieldHeight, 3, 1, false);
        const shell = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            color: PRISM_PURPLE,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        group.add(shell);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({
            color: 0xe2c9ff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        group.add(edges);
        const base = new THREE.Mesh(new THREE.CircleGeometry(this.prismRadius * 0.96, 3), new THREE.MeshBasicMaterial({
            color: PRISM_PURPLE,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        base.rotation.x = -Math.PI / 2;
        base.position.y = -this.fieldHeight * 0.5 + 0.0015;
        group.add(base);
        group.userData.shell = shell;
        group.userData.edges = edges;
        group.userData.base = base;
        return group;
    }

    //PRISM VFX
    #makePrismWisp({ mode, amount = 1 } = {}) {
        const color = PRISM_PURPLE;
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const group = new THREE.Group();
        const lower = new THREE.Mesh(this.wispGeometry, material);
        const upper = new THREE.Mesh(this.wispGeometry, material);
        const radius = 0.010 + Math.random() * 0.008;
        const height = 0.040 + Math.random() * 0.040;
        lower.scale.set(radius, height * 0.46, radius);
        lower.position.y = height * 0.24;
        upper.scale.set(radius * 0.58, height * 0.30, radius * 0.58);
        upper.position.y = height * 0.60;
        group.add(lower);
        group.add(upper);
        const angle = Math.random() * Math.PI * 2;
        const radial = Math.sqrt(Math.random()) * this.prismRadius * 0.70;
        let startY = -this.fieldHeight * 0.5 + 0.01;
        let velY = 0.12 + Math.random() * 0.08;
        let driftX = (Math.random() - 0.5) * 0.012;
        let driftZ = (Math.random() - 0.5) * 0.012;
        let life = 0.85 + Math.random() * 0.50;
        let baseOpacity = 0.065 + Math.random() * 0.065;
        if (mode === TriangleAnimation.RACK_RESET) {
            startY = (Math.random() - 0.5) * this.fieldHeight * 0.90;
            velY = (Math.random() - 0.5) * 0.01;
            driftX = (Math.random() - 0.5) * 0.006;
            driftZ = (Math.random() - 0.5) * 0.006;
            life = 0.65 + Math.random() * 0.55;
            baseOpacity = 0.055 + Math.random() * 0.050;
        }
        else if (mode === TriangleAnimation.CUE_RELEASE) {
            startY = this.fieldHeight * 0.5 - 0.01;
            velY = -(0.12 + Math.random() * 0.08);
        }
        group.position.set(Math.cos(angle) * radial, startY, Math.sin(angle) * radial);
        this.prism.add(group);
        return {
            group,
            material,
            elapsed: 0,
            life,
            velY,
            driftX,
            driftZ,
            startX: group.position.x,
            startY,
            startZ: group.position.z,
            baseOpacity,
            mode,
            swayPhase: Math.random() * Math.PI * 2,
            swayAmount: 0.003 + Math.random() * 0.005
        };
    }
    #spawnPrismWisp() {
        if (!this.current) {
            return;
        }
        this.prismWisps.push(this.#makePrismWisp({ mode: this.current.type }));
    }
    #updatePrismWisp(wisp, dt) {
        wisp.elapsed += dt;
        const t = clamp01(wisp.elapsed / wisp.life);
        const appear = smoothstep01(Math.min(1, t * 4.0));
        const fade = Math.pow(1 - t, 1.45);
        wisp.material.opacity = wisp.baseOpacity * appear * fade;
        const sway = Math.sin(wisp.swayPhase + wisp.elapsed * 4.6) * wisp.swayAmount * (0.4 + t);
        wisp.group.position.x = wisp.startX + wisp.driftX * wisp.elapsed + sway;
        wisp.group.position.z = wisp.startZ + wisp.driftZ * wisp.elapsed + sway * 0.45;
        wisp.group.position.y = wisp.startY + wisp.velY * wisp.elapsed;
        const spread = 1 + t * 0.50;
        wisp.group.scale.set(spread, 1 + t * 0.35, spread);
        return t >= 1;
    }
    #disposePrismWisp(wisp) {
        wisp.group.removeFromParent();
        wisp.material.dispose();
    }
    #clearPrismWisps() {
        for (const wisp of this.prismWisps) {
            this.#disposePrismWisp(wisp);
        }
        this.prismWisps = [];
        this.prismSpawnAccumulator = 0;
    }
    #updatePrismWisps(dt, spawn) {
        if (spawn) {
            this.prismSpawnAccumulator += dt;
            const interval = this.current?.type === TriangleAnimation.RACK_RESET ? 0.075 : 0.11;
            while (this.prismSpawnAccumulator >= interval) {
                this.prismSpawnAccumulator -= interval;
                this.#spawnPrismWisp();
            }
        }
        for (let i = this.prismWisps.length - 1; i >= 0; i -= 1) {
            const wisp = this.prismWisps[i];
            if (this.#updatePrismWisp(wisp, dt)) {
                this.#disposePrismWisp(wisp);
                this.prismWisps.splice(i, 1);
            }
        }
    }

    //RENDER STATE
    #setTriangleOpacity(value) {
        const opacity = clamp01(value);
        for (const material of this.triangleMaterials) {
            const baseOpacity = material.userData.triangleBaseOpacity ?? 1;
            const baseTransparent = material.userData.triangleBaseTransparent ?? false;
            const baseDepthWrite = material.userData.triangleBaseDepthWrite ?? true;
            material.opacity = baseOpacity * opacity;
            material.transparent = opacity < 0.999 ? true : baseTransparent;
            material.depthWrite = opacity > 0.999 ? baseDepthWrite : false;
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
    setCuePreviewOpacity(value = 1) {
        this.#setCueOpacity(value);
    }
    #setField(amount, center = this.actionCenter) {
        const t = clamp01(amount);
        this.prism.visible = t > 0.001;
        this.prism.position.set(center.x, this.root.position.y - this.fieldHeight * 0.5, center.z);
        this.prism.rotation.y = this.triangleYaw + this.prismYawOffset;
        this.prism.scale.set(1, 1, 1);
        this.prism.userData.shell.material.opacity = 0.050 * t;
        this.prism.userData.edges.material.opacity = 0.18 * t;
        this.prism.userData.base.material.opacity = 0.085 * t;
        this.light.intensity = 4.0 * t;
        this.light.color.setHex(PRISM_PURPLE);
    }
    #setRootPose(center, y) {
        this.root.position.set(center.x, y, center.z);
        this.root.rotation.set(0, this.triangleYaw, 0);
        this.light.position.set(center.x, Math.max(this.clothY + 0.18, y + 0.05), center.z);
    }
    #stopBody(body) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }
    #yawForAction(center, target) {
        const direction = target.clone().sub(center);
        direction.y = 0;
        if (direction.lengthSq() < 1e-8) {
            direction.set(1, 0, 0);
        }
        else {
            direction.normalize();
        }
        return Math.atan2(direction.x, direction.z) - Math.PI / 2;
    }

    //BALL TRACKS
    #buildRackTracks() {
        this.objectTracks = this.objectBallBodies.map((body, index) => {
            const start = body.position.clone();
            const target = this.objectBallStartPositions[index].clone();
            target.y = this.clothY + this.ballRadius;
            const horizontal = target.clone().sub(start);
            horizontal.y = 0;
            const length = horizontal.length();
            const perpendicular = length > 1e-7 ? new THREE.Vector3(-horizontal.z, 0, horizontal.x).normalize() : new THREE.Vector3(1, 0, 0);
            const signedCurve = ((index % 3) - 1) * Math.min(0.06, length * 0.11);
            this.#stopBody(body);
            return {
                body,
                start,
                target,
                previous: start.clone(),
                perpendicular,
                signedCurve,
                delay: 0.03 + ((index * 7) % 11) * 0.010
            };
        });
    }
    #updateRackTrack(track, localT) {
        const t = smootherstep01(localT);
        const position = track.start.clone().lerp(track.target, t);
        position.addScaledVector(track.perpendicular, Math.sin(Math.PI * t) * track.signedCurve);
        const delta = position.clone().sub(track.previous);
        const horizontalDelta = delta.clone();
        horizontalDelta.y = 0;
        const distance = horizontalDelta.length();
        if (distance > 1e-7) {
            const direction = horizontalDelta.multiplyScalar(1 / distance);
            const axis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
            const dq = new THREE.Quaternion().setFromAxisAngle(axis, distance / Math.max(1e-6, this.ballRadius));
            track.body.orientation.premultiply(dq).normalize();
        }
        track.body.position.copy(position);
        this.#stopBody(track.body);
        track.previous.copy(position);
    }
    #pinRackToTargets() {
        for (let i = 0; i < this.objectBallBodies.length; i += 1) {
            this.objectBallBodies[i].position.copy(this.objectBallStartPositions[i]);
            this.objectBallBodies[i].position.y = this.clothY + this.ballRadius;
            this.#stopBody(this.objectBallBodies[i]);
        }
    }

    //SEQUENCE
    #beginPrimitive(step) {
        this.current = step;
        this.time = 0;
        this.phase = Phase.TRIANGLE_ENTER;
        this.root.visible = true;
        this.prism.visible = false;
        if (step.type === TriangleAnimation.RACK_RESET) {
            this.actionCenter.copy(this.rackCenter);
            this.actionTarget.copy(this.cueBallStartPosition);
            this.triangleYaw = this.#yawForAction(this.rackCenter, this.cueBallStartPosition);
            this.#buildRackTracks();
            this.#setCueOpacity(1);
        }
        else if (step.type === TriangleAnimation.CUE_RECOVER) {
            this.actionCenter.copy(step.sourcePosition ?? this.cueBallBody.position);
            this.actionCenter.y = this.clothY;
            this.actionTarget.copy(step.targetPosition ?? this.cueBallStartPosition);
            this.actionTarget.y = this.clothY;
            this.triangleYaw = this.#yawForAction(this.actionCenter, this.actionTarget);
            this.cueActionStart = this.cueBallBody.position.clone();
            this.#stopBody(this.cueBallBody);
            this.#setCueOpacity(1);
        }
        else {
            this.actionTarget.copy(step.targetPosition ?? this.cueBallStartPosition);
            this.actionTarget.y = this.clothY;
            this.actionCenter.copy(this.actionTarget);
            this.triangleYaw = this.#yawForAction(this.actionTarget, this.rackCenter);
            this.cueBallBody.position.set(this.actionTarget.x, this.clothY + this.startOffset, this.actionTarget.z);
            this.#stopBody(this.cueBallBody);
            this.#setCueOpacity(0);
        }
        this.#setRootPose(this.actionCenter, this.clothY + this.startOffset);
        this.#setTriangleOpacity(0);
        this.#setField(0, this.actionCenter);
        this.#clearPrismWisps();
        this.#playTriangleSound("triangleAppear");
    }

    //PUBLIC CONTROL
    startSequence(steps, { onComplete = null } = {}) {
        if (this.isBusy() || !Array.isArray(steps) || steps.length === 0) {
            return false;
        }
        this.queue = steps.map(step => ({ ...step }));
        this.sequenceComplete = onComplete;
        this.#beginPrimitive(this.queue.shift());
        return true;
    }
    isBusy() {
        return this.phase !== Phase.IDLE;
    }
    cancel() {
        this.queue = [];
        this.current = null;
        this.sequenceComplete = null;
        this.phase = Phase.IDLE;
        this.time = 0;
        this.root.visible = false;
        this.prism.visible = false;
        this.light.intensity = 0;
        this.#setTriangleOpacity(0);
        this.#clearPrismWisps();
        this.#setCueOpacity(1);
        this.audioManager?.stopPrism?.({ fadeOut: 0.04 });
        this.triangleSoundHandle?.stop?.({ fadeOut: 0.04 });
        this.triangleSoundHandle = null;
    }
    #finishPrimitive() {
        if (this.current?.type === TriangleAnimation.RACK_RESET) {
            this.finalizeRackReset?.();
        }
        else if (this.current?.type === TriangleAnimation.CUE_RELEASE) {
            this.finalizeCueRelease?.(this.actionTarget.clone());
            this.#setCueOpacity(1);
        }
        this.root.visible = false;
        this.prism.visible = false;
        this.light.intensity = 0;
        this.#setTriangleOpacity(0);
        this.#clearPrismWisps();
        this.audioManager?.stopPrism?.({ fadeOut: 0.04 });
        if (this.queue.length > 0) {
            this.#beginPrimitive(this.queue.shift());
            return;
        }
        const callback = this.sequenceComplete;
        this.sequenceComplete = null;
        this.current = null;
        this.phase = Phase.IDLE;
        this.time = 0;
        callback?.();
    }

    //UPDATE LOOP
    update(dt) {
        if (!this.isBusy() || !this.current) {
            return;
        }
        this.time += dt;
        const type = this.current.type;
        if (this.phase === Phase.TRIANGLE_ENTER) {
            const t = smoothstep01(this.time / this.enterDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.startOffset, this.clothY + this.hoverOffset, t);
            this.#setRootPose(this.actionCenter, y);
            this.#setTriangleOpacity(t);
            this.#setField(0, this.actionCenter);
            this.#updatePrismWisps(dt, false);
            if (type === TriangleAnimation.CUE_RELEASE) {
                this.cueBallBody.position.set(this.actionTarget.x, y, this.actionTarget.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(t);
            }
            else if (type === TriangleAnimation.CUE_RECOVER) {
                this.#setCueOpacity(1);
            }
            if (this.time >= this.enterDuration) {
                this.time = 0;
                this.phase = Phase.PRISM_ENTER;
                this.audioManager?.startPrism?.(this.#audioPosition(), { fadeIn: this.fieldDuration });
            }
            return;
        }
        if (this.phase === Phase.PRISM_ENTER) {
            const t = smoothstep01(this.time / this.fieldDuration);
            this.#setRootPose(this.actionCenter, this.clothY + this.hoverOffset);
            this.#setTriangleOpacity(1);
            this.#setField(t, this.actionCenter);
            this.#updatePrismWisps(dt, true);
            if (type === TriangleAnimation.CUE_RELEASE) {
                this.cueBallBody.position.set(this.actionTarget.x, this.clothY + this.hoverOffset, this.actionTarget.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            if (this.time >= this.fieldDuration) {
                this.time = 0;
                this.phase = Phase.ACTION;
            }
            return;
        }
        if (this.phase === Phase.ACTION) {
            this.#setRootPose(this.actionCenter, this.clothY + this.hoverOffset);
            this.#setTriangleOpacity(1);
            this.#setField(1, this.actionCenter);
            this.#updatePrismWisps(dt, true);
            if (type === TriangleAnimation.RACK_RESET) {
                const raw = clamp01(this.time / this.rackReturnDuration);
                for (const track of this.objectTracks) {
                    const local = clamp01((raw - track.delay) / Math.max(0.001, 1 - track.delay));
                    this.#updateRackTrack(track, local);
                }
                if (this.time >= this.rackReturnDuration) {
                    for (const track of this.objectTracks) {
                        this.#updateRackTrack(track, 1);
                    }
                    this.time = 0;
                    this.phase = Phase.HOLD;
                }
                return;
            }
            if (type === TriangleAnimation.CUE_RECOVER) {
                const t = smootherstep01(this.time / this.cueRecoverDuration);
                const target = new THREE.Vector3(this.actionCenter.x, this.clothY + this.hoverOffset, this.actionCenter.z);
                this.cueBallBody.position.lerpVectors(this.cueActionStart, target, t);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
                if (this.time >= this.cueRecoverDuration) {
                    this.cueBallBody.position.copy(target);
                    this.time = 0;
                    this.phase = Phase.HOLD;
                }
                return;
            }
            const t = smootherstep01(this.time / this.cueReleaseDuration);
            this.cueBallBody.position.set(this.actionTarget.x, THREE.MathUtils.lerp(this.clothY + this.hoverOffset, this.clothY + this.ballRadius, t), this.actionTarget.z);
            this.#stopBody(this.cueBallBody);
            this.#setCueOpacity(1);
            if (this.time >= this.cueReleaseDuration) {
                this.time = 0;
                this.phase = Phase.HOLD;
            }
            return;
        }
        if (this.phase === Phase.HOLD) {
            this.#setRootPose(this.actionCenter, this.clothY + this.hoverOffset);
            this.#setTriangleOpacity(1);
            this.#setField(1, this.actionCenter);
            this.#updatePrismWisps(dt, true);
            if (type === TriangleAnimation.RACK_RESET) {
                this.#pinRackToTargets();
            }
            else if (type === TriangleAnimation.CUE_RECOVER) {
                this.cueBallBody.position.set(this.actionCenter.x, this.clothY + this.hoverOffset, this.actionCenter.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            else {
                this.cueBallBody.position.set(this.actionTarget.x, this.clothY + this.ballRadius, this.actionTarget.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            if (this.time >= this.holdDuration) {
                this.time = 0;
                this.phase = Phase.PRISM_EXIT;
                this.audioManager?.stopPrism?.({
                    fadeOut: this.fieldDuration
                });
            }
            return;
        }
        if (this.phase === Phase.PRISM_EXIT) {
            const t = smoothstep01(this.time / this.fieldDuration);
            this.#setRootPose(this.actionCenter, this.clothY + this.hoverOffset);
            this.#setTriangleOpacity(1);
            this.#setField(1 - t, this.actionCenter);
            this.#updatePrismWisps(dt, false);
            if (type === TriangleAnimation.RACK_RESET) {
                this.#pinRackToTargets();
                this.#setCueOpacity(1);
            }
            else if (type === TriangleAnimation.CUE_RECOVER) {
                this.cueBallBody.position.set(this.actionCenter.x, this.clothY + this.hoverOffset, this.actionCenter.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            else {
                this.cueBallBody.position.set(this.actionTarget.x, this.clothY + this.ballRadius, this.actionTarget.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            if (this.time >= this.fieldDuration) {
                this.time = 0;
                this.phase = Phase.TRIANGLE_EXIT;
                this.#setField(0, this.actionCenter);
                this.#clearPrismWisps();
                this.audioManager?.stopPrism?.({ fadeOut: 0 });
                this.#playTriangleSound("triangleDisappear");
            }
            return;
        }
        if (this.phase === Phase.TRIANGLE_EXIT) {
            const t = smoothstep01(this.time / this.exitDuration);
            const y = THREE.MathUtils.lerp(this.clothY + this.hoverOffset, this.clothY + this.startOffset, t);
            this.#setRootPose(this.actionCenter, y);
            this.#setTriangleOpacity(1 - t);
            this.#setField(0, this.actionCenter);
            this.#updatePrismWisps(dt, false);
            if (type === TriangleAnimation.RACK_RESET) {
                this.#pinRackToTargets();
                this.#setCueOpacity(1);
            }
            else if (type === TriangleAnimation.CUE_RECOVER) {
                this.cueBallBody.position.set(this.actionCenter.x, y, this.actionCenter.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1 - t);
            }
            else {
                this.cueBallBody.position.set(this.actionTarget.x, this.clothY + this.ballRadius, this.actionTarget.z);
                this.#stopBody(this.cueBallBody);
                this.#setCueOpacity(1);
            }
            if (this.time >= this.exitDuration) {
                if (type === TriangleAnimation.CUE_RECOVER) {
                    this.#setCueOpacity(0);
                }
                this.#finishPrimitive();
            }
        }
    }
    dispose() {
        this.audioManager?.stopPrism?.({ fadeOut: 0 });
        this.triangleSoundHandle?.stop?.({ fadeOut: 0 });
        this.triangleSoundHandle = null;
        this.root.removeFromParent();
        this.prism.removeFromParent();
        this.light.removeFromParent();
        this.#clearPrismWisps();
        this.prism.traverse(child => {
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        });
        for (const material of this.triangleMaterials) {
            material.dispose?.();
        }
        this.wispGeometry.dispose();
    }
}
