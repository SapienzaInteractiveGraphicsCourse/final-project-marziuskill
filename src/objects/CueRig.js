//DEPENDENCIES
import * as THREE from "three";
import { BALL, CUE_RIG, SHOT } from "../config/constants.js";

//SCRATCH STATE
const _axisCandidates = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
];
const _worldRoot = new THREE.Vector3();
const _worldOffset = new THREE.Vector3();
const _worldQuaternion = new THREE.Quaternion();
const _shotDirection = new THREE.Vector3();

//EASING
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t) {
    return t * t * t;
}

//CUE RIG
export class CueRig extends THREE.Group {
    constructor(cuePrototype) {
        super();
        this.name = "CueRig";
        this.aimPivot = new THREE.Group();
        this.aimPivot.name = "AimPivot";
        this.elevationPivot = new THREE.Group();
        this.elevationPivot.name = "ElevationPivot";
        this.contactOffsetPivot = new THREE.Group();
        this.contactOffsetPivot.name = "ContactOffsetPivot";
        this.rollPivot = new THREE.Group();
        this.rollPivot.name = "RollPivot";
        this.strokePivot = new THREE.Group();
        this.strokePivot.name = "StrokePivot";
        this.cue = cuePrototype;
        this.cue.name = "CueVisual";
        this.cue.visible = true;
        this.cue.position.set(0, 0, 0);
        this.cue.quaternion.identity();
        this.cue.updateMatrixWorld(true);
        this.#alignCueToPositiveZ();
        this.#measureCueGeometry();
        this.add(this.aimPivot);
        this.aimPivot.add(this.elevationPivot);
        this.elevationPivot.add(this.contactOffsetPivot);
        this.contactOffsetPivot.add(this.rollPivot);
        this.rollPivot.add(this.strokePivot);
        this.strokePivot.add(this.cue);
        this.yaw = 0;
        this.elevation = 0;
        this.roll = 0;
        this.hitU = SHOT.DEFAULT_HIT_U;
        this.hitV = SHOT.DEFAULT_HIT_V;
        this.contactSurfaceDistance = BALL.RADIUS;
        this.baseTipDistance = this.contactSurfaceDistance + CUE_RIG.TIP_GAP;
        this.clearanceMinimumDeg = CUE_RIG.MIN_ELEVATION_DEG;
        this.aimBlocked = false;
        this.strokeActive = false;
        this.strokeTime = 0;
        this.strokeOffset = 0;
        this.strokePower = 0;
        this.currentBackswing = CUE_RIG.MIN_BACKSWING;
        this.currentStrikeSpeed = CUE_RIG.MIN_STRIKE_SPEED;
        this.chargeDuration = this.currentBackswing / CUE_RIG.BACKSWING_SPEED;
        this.forwardDuration = (this.currentBackswing + CUE_RIG.FORWARD_TRAVEL) / this.currentStrikeSpeed;
        this.recoveryDuration = CUE_RIG.FORWARD_TRAVEL / CUE_RIG.RECOVERY_SPEED;
        this.totalStrokeDuration = this.chargeDuration + this.forwardDuration + this.recoveryDuration;
        this.impactTime = Number.POSITIVE_INFINITY;
        this.impactPending = false;
        this.impactEmitted = false;
        this.setYawDeg(CUE_RIG.DEFAULT_YAW_DEG);
        this.setElevationDeg(CUE_RIG.DEFAULT_ELEVATION_DEG);
        this.setContactOffsetNormalized(SHOT.DEFAULT_HIT_U, SHOT.DEFAULT_HIT_V);
        this.#applyStrokePosition();
    }
    #alignCueToPositiveZ() {
        const box = new THREE.Box3().setFromObject(this.cue);
        const size = new THREE.Vector3();
        box.getSize(size);
        const sizes = [size.x, size.y, size.z];
        let axisIndex = 0;
        if (sizes[1] > sizes[axisIndex])
            axisIndex = 1;
        if (sizes[2] > sizes[axisIndex])
            axisIndex = 2;
        const positiveExtent = [
            Math.max(0, box.max.x),
            Math.max(0, box.max.y),
            Math.max(0, box.max.z)
        ][axisIndex];
        const negativeExtent = [
            Math.max(0, -box.min.x),
            Math.max(0, -box.min.y),
            Math.max(0, -box.min.z)
        ][axisIndex];
        const sourceDirection = _axisCandidates[axisIndex].clone();
        if (negativeExtent > positiveExtent) {
            sourceDirection.negate();
        }
        this.cue.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(sourceDirection, new THREE.Vector3(0, 0, 1)));
        this.cue.updateMatrixWorld(true);
    }
    #measureCueGeometry() {
        const box = new THREE.Box3().setFromObject(this.cue);
        const size = new THREE.Vector3();
        box.getSize(size);
        this.cueMinZ = box.min.z;
        this.cueMaxZ = box.max.z;
        this.cueRadius = 0.5 * Math.max(size.x, size.y);
    }
    setYawDeg(degrees) {
        let wrapped = THREE.MathUtils.euclideanModulo(degrees + 180, 360) - 180;
        if (Math.abs(wrapped + 180) < 1e-9 && degrees > 0) {
            wrapped = 180;
        }
        this.yaw = THREE.MathUtils.degToRad(wrapped);
        this.aimPivot.rotation.y = this.yaw;
    }
    setElevationDeg(degrees) {
        const dynamicMinimum = Math.max(CUE_RIG.MIN_ELEVATION_DEG, this.clearanceMinimumDeg);
        const clamped = THREE.MathUtils.clamp(degrees, dynamicMinimum, CUE_RIG.MAX_ELEVATION_DEG);
        this.elevation = THREE.MathUtils.degToRad(clamped);
        this.elevationPivot.rotation.x = -this.elevation;
    }
    setRollDeg(degrees) {
        this.roll = THREE.MathUtils.degToRad(degrees);
        this.rollPivot.rotation.z = this.roll;
    }
    setContactOffsetNormalized(u, v) {
        let x = Number.isFinite(u) ? u : 0;
        let y = Number.isFinite(v) ? v : 0;
        const length = Math.hypot(x, y);
        const limit = SHOT.MAX_NORMALIZED_HIT_RADIUS;
        if (length > limit && length > 1e-10) {
            const scale = limit / length;
            x *= scale;
            y *= scale;
        }
        this.hitU = x;
        this.hitV = y;
        const offsetX = x * BALL.RADIUS;
        const offsetY = y * BALL.RADIUS;
        this.contactOffsetPivot.position.set(offsetX, offsetY, 0);
        const rhoSquared = offsetX * offsetX + offsetY * offsetY;
        this.contactSurfaceDistance = Math.sqrt(Math.max(0, BALL.RADIUS * BALL.RADIUS - rhoSquared));
        this.baseTipDistance = this.contactSurfaceDistance + CUE_RIG.TIP_GAP;
        this.#applyStrokePosition();
    }
    getContactOffsetNormalized() {
        return {
            u: this.hitU,
            v: this.hitV
        };
    }
    setClearanceState(minimumElevationDeg, blocked = false) {
        this.clearanceMinimumDeg = THREE.MathUtils.clamp(minimumElevationDeg, CUE_RIG.MIN_ELEVATION_DEG, CUE_RIG.MAX_ELEVATION_DEG);
        this.aimBlocked = blocked;
        if (this.getElevationDeg() < this.clearanceMinimumDeg) {
            this.setElevationDeg(this.clearanceMinimumDeg);
        }
    }
    getYawDeg() {
        return THREE.MathUtils.radToDeg(this.yaw);
    }
    getElevationDeg() {
        return THREE.MathUtils.radToDeg(this.elevation);
    }
    getMinimumElevationDeg() {
        return this.clearanceMinimumDeg;
    }
    isAimBlocked() {
        return this.aimBlocked;
    }
    getClearanceProfile() {
        return {
            radius: this.cueRadius,
            startDistance: this.baseTipDistance - CUE_RIG.FORWARD_TRAVEL + this.cueMinZ,
            endDistance: this.baseTipDistance + CUE_RIG.MAX_BACKSWING + this.cueMaxZ
        };
    }
    getCueAxisWorld(originTarget = new THREE.Vector3(), directionTarget = new THREE.Vector3()) {
        this.updateWorldMatrix(true, true);
        this.contactOffsetPivot.getWorldPosition(originTarget);
        this.contactOffsetPivot.getWorldQuaternion(_worldQuaternion);
        directionTarget.set(0, 0, -1).applyQuaternion(_worldQuaternion).normalize();
        return {
            origin: originTarget,
            direction: directionTarget
        };
    }
    getShotDirectionWorld(target = new THREE.Vector3()) {
        this.getCueAxisWorld(_worldOffset, target);
        return target;
    }
    getContactVectorWorld(target = new THREE.Vector3()) {
        this.updateWorldMatrix(true, true);
        this.getWorldPosition(_worldRoot);
        this.contactOffsetPivot.getWorldPosition(_worldOffset);
        this.getShotDirectionWorld(_shotDirection);
        target.copy(_worldOffset).sub(_worldRoot).addScaledVector(_shotDirection, -this.contactSurfaceDistance);
        return target;
    }
    getStrokeDebugInfo() {
        return {
            backswing: this.currentBackswing,
            strikeSpeed: this.currentStrikeSpeed,
            chargeDuration: this.chargeDuration,
            forwardDuration: this.forwardDuration,
            recoveryDuration: this.recoveryDuration,
            impactTime: this.impactTime
        };
    }
    getBackswingForPower(power = 1) {
        const p = THREE.MathUtils.clamp(power, 0, 1);
        return THREE.MathUtils.lerp(CUE_RIG.MIN_BACKSWING, CUE_RIG.MAX_BACKSWING, p);
    }
    setStrokeOffsetPreview(offset = 0) {
        if (this.strokeActive) {
            return false;
        }
        this.strokeOffset = THREE.MathUtils.clamp(offset, 0, CUE_RIG.MAX_BACKSWING);
        this.#applyStrokePosition();
        return true;
    }
    clearStrokeOffsetPreview() {
        if (this.strokeActive) {
            return false;
        }
        this.strokeOffset = 0;
        this.#applyStrokePosition();
        return true;
    }
    startStroke(power = 1, { skipCharge = false } = {}) {
        if (this.strokeActive || this.aimBlocked) {
            return false;
        }
        const p = THREE.MathUtils.clamp(power, 0, 1);
        this.strokePower = p;
        this.currentBackswing = this.getBackswingForPower(p);
        this.chargeDuration = skipCharge ? 0 : this.currentBackswing / CUE_RIG.BACKSWING_SPEED;
        this.currentStrikeSpeed = THREE.MathUtils.lerp(CUE_RIG.MIN_STRIKE_SPEED, CUE_RIG.MAX_STRIKE_SPEED, p * p);
        const forwardDistance = this.currentBackswing + CUE_RIG.FORWARD_TRAVEL;
        this.forwardDuration = forwardDistance / this.currentStrikeSpeed;
        this.recoveryDuration = CUE_RIG.FORWARD_TRAVEL / CUE_RIG.RECOVERY_SPEED;
        this.totalStrokeDuration = this.chargeDuration + this.forwardDuration + this.recoveryDuration;
        const easedContactFraction = (this.currentBackswing + CUE_RIG.TIP_GAP) / (this.currentBackswing + CUE_RIG.FORWARD_TRAVEL);
        const rawContactFraction = Math.cbrt(THREE.MathUtils.clamp(easedContactFraction, 0, 1));
        this.impactTime = this.chargeDuration + this.forwardDuration * rawContactFraction;
        this.strokeActive = true;
        this.strokeTime = 0;
        this.strokeOffset = skipCharge ? this.currentBackswing : 0;
        this.impactPending = false;
        this.impactEmitted = false;
        this.#applyStrokePosition();
        return true;
    }
    consumeImpactEvent() {
        if (!this.impactPending) {
            return false;
        }
        this.impactPending = false;
        return true;
    }
    update(dt) {
        if (!this.strokeActive) {
            return;
        }
        const previousTime = this.strokeTime;
        this.strokeTime = Math.min(this.strokeTime + dt, this.totalStrokeDuration);
        if (!this.impactEmitted && previousTime < this.impactTime && this.strokeTime >= this.impactTime) {
            this.impactPending = true;
            this.impactEmitted = true;
        }
        if (this.strokeTime < this.chargeDuration) {
            const u = easeInOutCubic(this.strokeTime / this.chargeDuration);
            this.strokeOffset = THREE.MathUtils.lerp(0, this.currentBackswing, u);
        }
        else if (this.strokeTime < this.chargeDuration + this.forwardDuration) {
            const localTime = this.strokeTime - this.chargeDuration;
            const u = easeInCubic(localTime / this.forwardDuration);
            this.strokeOffset = THREE.MathUtils.lerp(this.currentBackswing, -CUE_RIG.FORWARD_TRAVEL, u);
        }
        else {
            const localTime = this.strokeTime - this.chargeDuration - this.forwardDuration;
            const u = easeOutCubic(THREE.MathUtils.clamp(localTime / this.recoveryDuration, 0, 1));
            this.strokeOffset = THREE.MathUtils.lerp(-CUE_RIG.FORWARD_TRAVEL, 0, u);
        }
        this.#applyStrokePosition();
        if (this.strokeTime >= this.totalStrokeDuration) {
            this.strokeActive = false;
            this.strokeTime = 0;
            this.strokeOffset = 0;
            this.#applyStrokePosition();
        }
    }
    #applyStrokePosition() {
        this.strokePivot.position.set(0, 0, this.baseTipDistance + this.strokeOffset);
    }
}
