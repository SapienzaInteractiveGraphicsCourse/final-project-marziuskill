//Owns cue-ball placement, legal-region validation and top-down placement input.

//DEPENDENCIES
import * as THREE from "three";
import { BALL_IN_HAND } from "../config/constants.js";

//PLACEMENT MODES
export const BallInHandMode = Object.freeze({
    ANYWHERE: "ANYWHERE",
    KITCHEN: "KITCHEN"
});
import { BallState } from "../physics/RigidBall.js";

//SCRATCH STATE
const _ndc = new THREE.Vector2();
const _candidate = new THREE.Vector3();
const _supportProbe = new THREE.Vector3();
const _topViewTarget = new THREE.Vector3();
const _nearCenter = new THREE.Vector3();
const _farCenter = new THREE.Vector3();
const _screenRight = new THREE.Vector3();
const _screenUp = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _relative = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

//BALL IN HAND
export class BallInHandSystem {

    //INITIALIZATION
    constructor({ camera, canvas, controls, scene, playingSurfaceSystem, playingSurfaceBox, pocketSystem, cueBallBody, objectBallBodies, clothY, kitchen }) {
        this.camera = camera;
        this.canvas = canvas;
        this.controls = controls;
        this.scene = scene;
        this.playingSurfaceSystem = playingSurfaceSystem;
        this.playingSurfaceBox = playingSurfaceBox.clone();
        this.pocketSystem = pocketSystem;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.clothY = clothY;
        this.kitchen = kitchen;
        this.mode = BallInHandMode.ANYWHERE;
        this.kitchenLine = null;
        this.raycaster = new THREE.Raycaster();
        this.active = false;
        this.dragging = false;
        this.valid = false;
        this.reason = "Ball-in-hand inactive.";
        this.lastCandidate = null;
        this.cameraSnapshot = null;
        this._onPointerDown = this.#onPointerDown.bind(this);
        this._onPointerMove = this.#onPointerMove.bind(this);
        this._onPointerUp = this.#onPointerUp.bind(this);
        this.canvas.addEventListener("pointerdown", this._onPointerDown);
        this.canvas.addEventListener("pointermove", this._onPointerMove);
        window.addEventListener("pointerup", this._onPointerUp);
        window.addEventListener("pointercancel", this._onPointerUp);
    }
    isActive() {
        return this.active;
    }
    canConfirm() {
        return (this.active && this.valid);
    }
    getState() {
        return {
            active: this.active,
            valid: this.valid,
            reason: this.reason,
            mode: this.mode,
            position: this.cueBallBody.position.clone()
        };
    }

    //PLACEMENT FLOW
    begin({ preferredPosition = null, mode = BallInHandMode.ANYWHERE } = {}) {
        this.active = true;
        this.dragging = false;
        this.mode = mode;
        this.#saveCameraState();
        this.#enterTopDownView();
        this.#setKitchenLineVisible(this.mode === BallInHandMode.KITCHEN);
        if (this.controls) {
            this.controls.enabled = false;
        }
        this.canvas.style.cursor = "crosshair";
        this.#clearCueBallPocketState();
        let placed = false;
        if (preferredPosition) {
            const candidate = preferredPosition.clone();
            candidate.y = this.clothY + this.cueBallBody.radius;
            const result = this.#validate(candidate);
            if (result.valid) {
                this.#place(candidate);
                placed = true;
            }
        }
        if (!placed) {
            const center = new THREE.Vector3();
            this.playingSurfaceBox.getCenter(center);
            center.y = this.clothY + this.cueBallBody.radius;
            const result = this.#validate(center);
            if (result.valid) {
                this.#place(center);
                placed = true;
            }
        }
        this.valid = placed;
        this.reason = placed ? this.mode === BallInHandMode.KITCHEN ? "Valid kitchen placement — drag, then press Enter or confirm." : "Valid placement — drag on the cloth; press Enter or confirm." : "Drag the cue ball to a valid free point on the cloth.";
        return this.getState();
    }
    placeAutomatically({ preferredPositions = [], mode = BallInHandMode.ANYWHERE } = {}) {
        this.cancel();
        this.mode = mode;
        this.#clearCueBallPocketState();
        const candidates = [];
        for (const preferred of preferredPositions) {
            if (preferred?.isVector3) {
                candidates.push(preferred.clone());
            }
        }
        const fractions = [
            0.50,
            0.35,
            0.65,
            0.20,
            0.80,
            0.10,
            0.90
        ];
        for (const fx of fractions) {
            for (const fz of fractions) {
                candidates.push(new THREE.Vector3(THREE.MathUtils.lerp(this.playingSurfaceBox.min.x, this.playingSurfaceBox.max.x, fx), this.clothY + this.cueBallBody.radius, THREE.MathUtils.lerp(this.playingSurfaceBox.min.z, this.playingSurfaceBox.max.z, fz)));
            }
        }
        for (const candidate of candidates) {
            candidate.y = this.clothY + this.cueBallBody.radius;
            const result = this.#validate(candidate);
            if (!result.valid) {
                continue;
            }
            this.#place(candidate);
            this.active = false;
            this.dragging = false;
            this.valid = true;
            this.lastCandidate = candidate.clone();
            this.reason = this.mode === BallInHandMode.KITCHEN ? "CPU placed the cue ball legally in the kitchen." : "CPU placed the cue ball legally.";
            return {
                success: true,
                ...this.getState()
            };
        }
        this.active = false;
        this.dragging = false;
        this.valid = false;
        this.reason = "CPU could not find a valid ball-in-hand placement.";
        return {
            success: false,
            ...this.getState()
        };
    }
    confirm() {
        if (!this.canConfirm()) {
            return false;
        }
        this.active = false;
        this.dragging = false;
        this.#setKitchenLineVisible(false);
        this.#restoreCameraState();
        this.canvas.style.cursor = "";
        this.cueBallBody.setAtRest();
        this.cueBallBody.hasSupport = true;
        this.reason = "Ball-in-hand confirmed.";
        return true;
    }
    cancel() {
        this.active = false;
        this.dragging = false;
        this.valid = false;
        this.#setKitchenLineVisible(false);
        this.#restoreCameraState();
        this.canvas.style.cursor = "";
        this.reason = "Ball-in-hand inactive.";
    }
    dispose() {
        this.cancel();
        this.canvas.removeEventListener("pointerdown", this._onPointerDown);
        this.canvas.removeEventListener("pointermove", this._onPointerMove);
        window.removeEventListener("pointerup", this._onPointerUp);
        window.removeEventListener("pointercancel", this._onPointerUp);
    }
    #setKitchenLineVisible(visible) {
        if (!this.scene) {
            return;
        }
        if (!visible) {
            if (this.kitchenLine) {
                this.scene.remove(this.kitchenLine);
                this.kitchenLine.geometry?.dispose?.();
                this.kitchenLine.material?.dispose?.();
                this.kitchenLine = null;
            }
            return;
        }
        if (this.kitchenLine || !this.kitchen) {
            return;
        }
        const axis = this.kitchen.axis;
        const shortAxis = axis === "x" ? "z" : "x";
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        this.playingSurfaceBox.getCenter(a);
        b.copy(a);
        a[axis] = this.kitchen.headString;
        b[axis] = this.kitchen.headString;
        a[shortAxis] = this.playingSurfaceBox.min[shortAxis];
        b[shortAxis] = this.playingSurfaceBox.max[shortAxis];
        a.y = this.clothY + 0.004;
        b.y = a.y;
        const geometry = new THREE.BufferGeometry().setFromPoints([
            a,
            b
        ]);
        const material = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        this.kitchenLine = new THREE.Line(geometry, material);
        this.kitchenLine.name = "HeadStringBallInHand";
        this.kitchenLine.renderOrder = 98;
        this.scene.add(this.kitchenLine);
    }
    #saveCameraState() {
        if (this.cameraSnapshot) {
            return;
        }
        this.cameraSnapshot = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            up: this.camera.up.clone(),
            near: this.camera.near,
            far: this.camera.far,
            controlsTarget: this.controls ? this.controls.target.clone() : null,
            controlsEnabled: this.controls ? this.controls.enabled : true
        };
    }
    #restoreCameraState() {
        const snapshot = this.cameraSnapshot;
        if (!snapshot) {
            return;
        }
        this.camera.position.copy(snapshot.position);
        this.camera.quaternion.copy(snapshot.quaternion);
        this.camera.up.copy(snapshot.up);
        this.camera.near = snapshot.near;
        this.camera.far = snapshot.far;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld(true);
        if (this.controls) {
            if (snapshot.controlsTarget) {
                this.controls.target.copy(snapshot.controlsTarget);
            }
            this.controls.update();
            this.controls.enabled = snapshot.controlsEnabled;
        }
        this.cameraSnapshot = null;
    }

    //CAMERA
    #enterTopDownView() {
        this.playingSurfaceBox.getCenter(_topViewTarget);
        _topViewTarget.y = this.clothY;
        const nearLeft = this.pocketSystem.getPocketByName("Pocket_Left_Near");
        const nearRight = this.pocketSystem.getPocketByName("Pocket_Right_Near");
        const farLeft = this.pocketSystem.getPocketByName("Pocket_Left_Far");
        const farRight = this.pocketSystem.getPocketByName("Pocket_Right_Far");
        if (nearLeft && nearRight && farLeft && farRight) {
            _nearCenter.copy(nearLeft.center).add(nearRight.center).multiplyScalar(0.5);
            _farCenter.copy(farLeft.center).add(farRight.center).multiplyScalar(0.5);
            _screenRight.subVectors(_farCenter, _nearCenter);
            _screenRight.y = 0;
        }
        else {
            const sizeX = this.playingSurfaceBox.max.x - this.playingSurfaceBox.min.x;
            const sizeZ = this.playingSurfaceBox.max.z - this.playingSurfaceBox.min.z;
            _screenRight.set(sizeX >= sizeZ ? 1 : 0, 0, sizeX >= sizeZ ? 0 : 1);
        }
        if (_screenRight.lengthSq() < 1e-12) {
            _screenRight.set(1, 0, 0);
        }
        _screenRight.normalize();
        _screenUp.crossVectors(WORLD_UP, _screenRight).normalize();
        let halfWidth = 0;
        let halfHeight = 0;
        const xs = [
            this.playingSurfaceBox.min.x,
            this.playingSurfaceBox.max.x
        ];
        const zs = [
            this.playingSurfaceBox.min.z,
            this.playingSurfaceBox.max.z
        ];
        for (const x of xs) {
            for (const z of zs) {
                _corner.set(x, this.clothY, z);
                _relative.subVectors(_corner, _topViewTarget);
                halfWidth = Math.max(halfWidth, Math.abs(_relative.dot(_screenRight)));
                halfHeight = Math.max(halfHeight, Math.abs(_relative.dot(_screenUp)));
            }
        }
        const tanVertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
        const tanHorizontal = tanVertical * this.camera.aspect;
        const distance = Math.max(halfHeight / Math.max(tanVertical, 1e-6), halfWidth / Math.max(tanHorizontal, 1e-6)) * 1.18;
        this.camera.up.copy(_screenUp);
        this.camera.position.set(_topViewTarget.x, _topViewTarget.y + distance, _topViewTarget.z);
        this.camera.near = Math.max(0.005, distance / 500);
        this.camera.far = Math.max(100, distance * 20);
        this.camera.lookAt(_topViewTarget);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld(true);
        if (this.controls) {
            this.controls.target.copy(_topViewTarget);
            this.controls.update();
        }
    }
    #onPointerDown(event) {
        if (!this.active) {
            return;
        }
        this.dragging = true;
        try {
            this.canvas.setPointerCapture(event.pointerId);
        }
        catch {
        }
        this.#updateFromPointer(event);
        event.preventDefault();
    }
    #onPointerMove(event) {
        if (!this.active || !this.dragging) {
            return;
        }
        this.#updateFromPointer(event);
        event.preventDefault();
    }
    #onPointerUp(event) {
        if (!this.active) {
            return;
        }
        this.dragging = false;
        try {
            if (this.canvas.hasPointerCapture(event.pointerId)) {
                this.canvas.releasePointerCapture(event.pointerId);
            }
        }
        catch {
        }
    }

    //POINTER PLACEMENT
    #updateFromPointer(event) {
        const rect = this.canvas.getBoundingClientRect();
        _ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(_ndc, this.camera);
        const hits = this.raycaster.intersectObject(this.playingSurfaceSystem.playingSurface, true);
        if (hits.length === 0) {
            this.valid = false;
            this.reason = "Invalid: pointer is not over the playing surface.";
            return;
        }
        _candidate.copy(hits[0].point);
        _candidate.y = hits[0].point.y + this.cueBallBody.radius;
        this.lastCandidate = _candidate.clone();
        const result = this.#validate(_candidate);
        this.valid = result.valid;
        this.reason = result.reason;
        if (result.valid) {
            this.#place(_candidate);
        }
    }

    //VALIDATION
    #validate(candidate) {
        const radius = this.cueBallBody.radius;
        const minX = this.playingSurfaceBox.min.x + radius + BALL_IN_HAND.EDGE_MARGIN;
        const maxX = this.playingSurfaceBox.max.x - radius - BALL_IN_HAND.EDGE_MARGIN;
        const minZ = this.playingSurfaceBox.min.z + radius + BALL_IN_HAND.EDGE_MARGIN;
        const maxZ = this.playingSurfaceBox.max.z - radius - BALL_IN_HAND.EDGE_MARGIN;
        if (candidate.x < minX || candidate.x > maxX || candidate.z < minZ || candidate.z > maxZ) {
            return {
                valid: false,
                reason: "Invalid: cue ball would overlap the table edge/cushion."
            };
        }
        if (this.mode === BallInHandMode.KITCHEN && this.kitchen) {
            const coordinate = candidate[this.kitchen.axis];
            const validKitchenSide = this.kitchen.headPositive ? coordinate > this.kitchen.headString + BALL_IN_HAND.HEAD_STRING_EPSILON : coordinate < this.kitchen.headString - BALL_IN_HAND.HEAD_STRING_EPSILON;
            if (!validKitchenSide) {
                return {
                    valid: false,
                    reason: "Invalid: the cue-ball center must stay behind the head string (inside the kitchen)."
                };
            }
        }
        _supportProbe.set(candidate.x, candidate.y + radius, candidate.z);
        const support = this.playingSurfaceSystem.getSupportBelow(_supportProbe, radius * 4);
        if (!support) {
            return {
                valid: false,
                reason: "Invalid: no PlayingSurface support below the cue ball."
            };
        }
        const pocket = this.pocketSystem?.findPocketNear(candidate, radius * BALL_IN_HAND.POCKET_MARGIN_RADIUS_FACTOR);
        if (pocket) {
            return {
                valid: false,
                reason: `Invalid: overlaps ${pocket.name}.`
            };
        }
        const minimumDistance = radius * 2 + BALL_IN_HAND.BALL_CLEARANCE;
        const minimumDistanceSq = minimumDistance * minimumDistance;
        for (const other of this.objectBallBodies) {
            if (other.pocketCommitted || other.state === BallState.FALLEN || other.state === BallState.COLLECTED) {
                continue;
            }
            const dx = candidate.x - other.position.x;
            const dz = candidate.z - other.position.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq < minimumDistanceSq) {
                return {
                    valid: false,
                    reason: `Invalid: overlaps ${other.label}.`
                };
            }
        }
        return {
            valid: true,
            reason: this.mode === BallInHandMode.KITCHEN ? "Valid kitchen placement — release, then press Enter or confirm." : "Valid placement — release, then press Enter or confirm."
        };
    }
    #place(position) {
        this.#clearCueBallPocketState();
        this.cueBallBody.position.copy(position);
        this.cueBallBody.velocity.set(0, 0, 0);
        this.cueBallBody.angularVelocity.set(0, 0, 0);
        this.cueBallBody.clearAccumulators();
        this.cueBallBody.orientation.identity();
        this.cueBallBody.setAtRest();
        this.cueBallBody.hasSupport = true;
    }
    #clearCueBallPocketState() {
        const ball = this.cueBallBody;
        ball.pocketName = null;
        ball.pocketCommitted = false;
        ball.returnSettledTime = 0;
        ball.returnTargetId = null;
        ball.returnFloorY = null;
        ball.returnStage = null;
        ball.returnLaneCoordinate = null;
    }
}
