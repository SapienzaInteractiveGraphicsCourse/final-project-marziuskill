//Owns the player camera, free movement, aiming, power and shot-view transitions.

//DEPENDENCIES
import * as THREE from "three";
import { BALL, CUE_RIG, SHOT, PLAYER_VIEW } from "../config/constants.js";

//VIEW STATE
export const PlayerViewPhase = Object.freeze({
    DISABLED: "DISABLED",
    TRANSITION: "TRANSITION",
    FREE: "FREE",
    AIM: "AIM",
    POWER: "POWER",
    SHOT: "SHOT"
});

//HELPERS
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
function easeInOutCubic(t) {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function yawForDirection(direction) {
    return THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
}
function angleDeltaDeg(a, b) {
    let d = (a - b + 180) % 360;
    if (d < 0)
        d += 360;
    return d - 180;
}
function copyPose(pose) {
    return {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone(),
        up: pose.up?.clone?.() ?? new THREE.Vector3(0, 1, 0),
        near: pose.near,
        far: pose.far
    };
}

//PLAYER CONTROLLER
export class PlayerGameplayController {

    //INITIALIZATION
    constructor({ camera, canvas, controls, pubEnvironment, cueRig, shotSystem, clearanceSystem, trajectoryPreviewSystem, cueBallBody, tableBox, kitchenRegion, topDownPose, matchController, ballInHandSystem, cpuCueAnimator, hud, initialPose, audioManager = null }) {
        this.camera = camera;
        this.canvas = canvas;
        this.controls = controls;
        this.pubEnvironment = pubEnvironment;
        this.cueRig = cueRig;
        this.shotSystem = shotSystem;
        this.clearanceSystem = clearanceSystem;
        this.trajectoryPreviewSystem = trajectoryPreviewSystem;
        this.cueBallBody = cueBallBody;
        this.tableBox = tableBox.clone();
        this.kitchenRegion = kitchenRegion ? { ...kitchenRegion } : null;
        this.topDownPose = copyPose(topDownPose);
        this.matchController = matchController;
        this.ballInHandSystem = ballInHandSystem;
        this.cpuCueAnimator = cpuCueAnimator;
        this.hud = hud;
        this.audioManager = audioManager;
        this.playerWalkDistance = 0;
        this.playerStepSpacing = 0.58;
        this.tableCenter = this.tableBox.getCenter(new THREE.Vector3());
        const tableSize = this.tableBox.getSize(new THREE.Vector3());
        this.baseOrbitRadiusX = tableSize.x / 2 + PLAYER_VIEW.TABLE_MARGIN;
        this.baseOrbitRadiusZ = tableSize.z / 2 + PLAYER_VIEW.TABLE_MARGIN;
        const kitchenAxis = this.kitchenRegion?.axis ?? (tableSize.x >= tableSize.z ? "x" : "z");
        if (this.kitchenRegion?.headString != null) {
            this.kitchenDepth = this.kitchenRegion.headPositive ? this.tableBox.max[kitchenAxis] - this.kitchenRegion.headString : this.kitchenRegion.headString - this.tableBox.min[kitchenAxis];
        }
        else {
            this.kitchenDepth = tableSize[kitchenAxis] * 0.25;
        }
        this.orbitTheta = 0;
        this.orbitScale = 1;
        this.headYawDeg = 0;
        this.headPitchDeg = -8;
        this.savedFreeState = null;
        this.lastHumanPreAimState = null;
        this.phase = PlayerViewPhase.DISABLED;
        this.transition = null;
        this.keys = new Set();
        this.enterRequested = false;
        this.cancelRequested = false;
        this.blockEnterUntilReleased = false;
        this.leftMouseDown = false;
        this.lastPointer = null;
        this.aimYawCenterDeg = 0;
        this.aimYawDeltaDeg = 0;
        this.aimElevationDeg = CUE_RIG.DEFAULT_ELEVATION_DEG;
        this.aimYawFreedomDeg = PLAYER_VIEW.AIM_YAW_FREEDOM_NEAR_DEG;
        this.aimElevationMaxDeg = CUE_RIG.MAX_ELEVATION_DEG;
        this.maxPower = SHOT.MAX_POWER;
        this.powerNormalized = SHOT.MIN_POWER;
        this.powerDirection = 1;
        this.currentPower = SHOT.MIN_POWER;
        this.trajectoryHoldActive = false;
        this.contactMarker = this.#createContactMarker();
        this.lastRulePlayer = null;
        this.cpuSpectatorLocked = false;
        this.cinematicLocked = false;
        this.paused = false;
        this._onKeyDown = this.#onKeyDown.bind(this);
        this._onKeyUp = this.#onKeyUp.bind(this);
        this._onPointerDown = this.#onPointerDown.bind(this);
        this._onPointerUp = this.#onPointerUp.bind(this);
        this._onPointerMove = this.#onPointerMove.bind(this);
        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup", this._onKeyUp);
        this.canvas.addEventListener("pointerdown", this._onPointerDown);
        window.addEventListener("pointerup", this._onPointerUp);
        window.addEventListener("pointermove", this._onPointerMove);
        if (this.controls) {
            this.controls.enabled = false;
        }
        this.initializeFromPose(initialPose);
        this.#setTrajectoryHold(false, true);
    }
    #setTrajectoryHold(enabled, force = false) {
        const next = Boolean(enabled);
        if (!force && this.trajectoryHoldActive === next) {
            return;
        }
        this.trajectoryHoldActive = next;
        this.trajectoryPreviewSystem.setEnabled(next);
        if (next) {
            this.trajectoryPreviewSystem.invalidate?.();
        }
    }
    #createContactMarker() {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS * 0.115, 14, 10), new THREE.MeshBasicMaterial({
            color: 0x38a8ff,
            depthTest: false,
            transparent: true,
            opacity: 0.95
        }));
        marker.name = "CueBallContactMarker";
        marker.visible = false;
        marker.renderOrder = 120;
        this.cueRig.parent?.add?.(marker);
        return marker;
    }

    //LIFECYCLE
    initializeFromPose(pose) {
        const p = pose?.position ?? this.camera.position;
        const dx = p.x - this.tableCenter.x;
        const dz = p.z - this.tableCenter.z;
        const normalizedX = dx / Math.max(0.001, this.baseOrbitRadiusX);
        const normalizedZ = dz / Math.max(0.001, this.baseOrbitRadiusZ);
        this.orbitScale = THREE.MathUtils.clamp(Math.hypot(normalizedX, normalizedZ), 0.82, 1.35);
        this.orbitTheta = Math.atan2(dz / (this.baseOrbitRadiusZ * this.orbitScale), dx / (this.baseOrbitRadiusX * this.orbitScale));
        if (pose?.quaternion) {
            const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.quaternion).normalize();
            const horizontalCamera = cameraForward.clone();
            horizontalCamera.y = 0;
            const bodyForward = this.tableCenter.clone().sub(p);
            bodyForward.y = 0;
            if (horizontalCamera.lengthSq() > 1e-8) {
                horizontalCamera.normalize();
            }
            if (bodyForward.lengthSq() > 1e-8) {
                bodyForward.normalize();
            }
            this.headYawDeg = THREE.MathUtils.clamp(angleDeltaDeg(yawForDirection(horizontalCamera), yawForDirection(bodyForward)), -PLAYER_VIEW.HEAD_YAW_LIMIT_DEG, PLAYER_VIEW.HEAD_YAW_LIMIT_DEG);
            this.headPitchDeg = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(cameraForward.y, -1, 1))), -PLAYER_VIEW.HEAD_PITCH_DOWN_LIMIT_DEG, PLAYER_VIEW.HEAD_PITCH_UP_LIMIT_DEG);
        }
        else {
            this.headYawDeg = 0;
            this.headPitchDeg = -8;
        }
        this.savedFreeState = this.#captureFreeState();
        this.lastHumanPreAimState = this.#captureFreeState();
        this.#applyFreeCamera();
        this.phase = PlayerViewPhase.FREE;
        this.#showHeldCue();
    }

    //BALL IN HAND
    beforeBallInHand() {
        this.enterRequested = false;
        this.cancelRequested = false;
        if (this.phase === PlayerViewPhase.FREE) {
            this.savedFreeState = this.#captureFreeState();
        }
        this.phase = PlayerViewPhase.DISABLED;
        this.transition = null;
        this.#hideHeldCue();
        this.cueRig.visible = false;
        this.contactMarker.visible = false;
        this.hud.hidePower();
        this.hud.setState("BALL IN HAND · drag the cue ball · Enter to confirm");
        this.#setTrajectoryHold(false, true);
    }
    animateIntoBallInHand(targetTopDownPose = this.topDownPose, { onComplete = null } = {}) {
        this.beforeBallInHand();
        const target = copyPose(targetTopDownPose ?? this.topDownPose);
        this.#startTransition(target, PLAYER_VIEW.BEV_RETURN_DURATION, () => {
            this.phase = PlayerViewPhase.DISABLED;
            onComplete?.();
        });
    }
    afterBallInHandConfirmed(fromTopDownPose, { suppressEnter = false } = {}) {
        this.enterRequested = false;
        this.cancelRequested = false;
        this.blockEnterUntilReleased = suppressEnter;
        if (this.savedFreeState) {
            this.#restoreFreeState(this.savedFreeState);
        }
        const target = this.#getFreeCameraPose();
        this.camera.position.copy(fromTopDownPose.position);
        this.camera.quaternion.copy(fromTopDownPose.quaternion);
        this.camera.up.copy(fromTopDownPose.up ?? new THREE.Vector3(0, 1, 0));
        this.camera.updateMatrixWorld(true);
        this.#startTransition(target, PLAYER_VIEW.BEV_RETURN_DURATION, () => {
            this.phase = PlayerViewPhase.FREE;
            this.#showHeldCue();
        });
    }
    enterTopDownSelection(targetTopDownPose = this.topDownPose, { hudText = "Select a pocket", onComplete = null } = {}) {
        this.enterRequested = false;
        this.cancelRequested = false;
        if (this.phase === PlayerViewPhase.FREE) {
            this.savedFreeState = this.#captureFreeState();
        }
        this.phase = PlayerViewPhase.DISABLED;
        this.transition = null;
        this.#hideHeldCue();
        this.cueRig.visible = false;
        this.contactMarker.visible = false;
        this.hud.hidePower();
        this.hud.setState(hudText);
        this.#setTrajectoryHold(false, true);
        const target = copyPose(targetTopDownPose ?? this.topDownPose);
        this.#startTransition(target, PLAYER_VIEW.BEV_RETURN_DURATION, () => {
            this.phase = PlayerViewPhase.DISABLED;
            onComplete?.();
        });
    }
    exitTopDownSelection(fromTopDownPose = null, { suppressEnter = true, onComplete = null } = {}) {
        this.enterRequested = false;
        this.cancelRequested = false;
        this.blockEnterUntilReleased = suppressEnter;
        if (this.savedFreeState) {
            this.#restoreFreeState(this.savedFreeState);
        }
        const target = this.#getFreeCameraPose();
        const source = copyPose(fromTopDownPose ?? this.topDownPose);
        this.camera.position.copy(source.position);
        this.camera.quaternion.copy(source.quaternion);
        this.camera.up.copy(source.up ?? new THREE.Vector3(0, 1, 0));
        this.camera.updateMatrixWorld(true);
        this.#startTransition(target, PLAYER_VIEW.BEV_RETURN_DURATION, () => {
            this.phase = PlayerViewPhase.FREE;
            this.#showHeldCue();
            onComplete?.();
        });
    }

    //LOCKS
    setPaused(active) {
        this.paused = Boolean(active);
        if (this.paused) {
            this.enterRequested = false;
            this.cancelRequested = false;
            this.leftMouseDown = false;
            this.lastPointer = null;
            this.keys.clear();
        }
    }
    setCinematicLock(active) {
        this.cinematicLocked = Boolean(active);
        if (this.cinematicLocked) {
            this.enterRequested = false;
            this.cancelRequested = false;
            this.leftMouseDown = false;
            this.lastPointer = null;
            this.keys.clear();
            this.#setTrajectoryHold(false, true);
            this.hud.hidePower();
            this.hud.setState("");
            this.contactMarker.visible = false;
        }
    }
    getCinematicStandingPose() {
        const state = this.lastHumanPreAimState ?? this.savedFreeState ?? this.#captureFreeState();
        const position = new THREE.Vector3(this.tableCenter.x + Math.cos(state.orbitTheta) * this.baseOrbitRadiusX * state.orbitScale, PLAYER_VIEW.EYE_HEIGHT, this.tableCenter.z + Math.sin(state.orbitTheta) * this.baseOrbitRadiusZ * state.orbitScale);
        const target = this.tableCenter.clone();
        target.y = this.cueBallBody.position.y;
        return {
            position,
            quaternion: this.#lookQuaternion(position, target),
            up: new THREE.Vector3(0, 1, 0)
        };
    }
    prepareSpectatorForCpuThinking() {
        if (this.phase !== PlayerViewPhase.FREE) {
            return null;
        }
        this.cpuSpectatorLocked = true;
        this.#applyCpuSpectatorLockCamera();
        return false;
    }
    prepareAutoClearForCpuShot({ cueBallPosition, shotDirection, sidePreference = "right" } = {}) {
        if (!cueBallPosition || !shotDirection) {
            return false;
        }
        if (this.phase !== PlayerViewPhase.FREE) {
            return null;
        }
        const direction = shotDirection.clone();
        direction.y = 0;
        if (direction.lengthSq() < 1e-8) {
            return false;
        }
        direction.normalize();
        const rearLength = 1.75;
        const smallForwardAllowance = 0.16;
        const clearanceRadius = 0.38;
        const blocksCpuLane = position => {
            const offset = position.clone().sub(cueBallPosition);
            offset.y = 0;
            const signedForward = offset.dot(direction);
            if (signedForward < -rearLength || signedForward > smallForwardAllowance) {
                return false;
            }
            const closest = cueBallPosition.clone().addScaledVector(direction, signedForward);
            closest.y = position.y;
            return Math.hypot(position.x - closest.x, position.z - closest.z) < clearanceRadius;
        };
        const playerPosition = this.#positionForOrbit(this.orbitTheta);
        if (!blocksCpuLane(playerPosition)) {
            return false;
        }
        const preferredSign = sidePreference === "left" ? -1 : 1;
        const angularStep = 0.11;
        const maxSteps = 18;
        let targetTheta = null;
        for (const sign of [preferredSign, -preferredSign]) {
            for (let step = 2; step <= maxSteps; step += 1) {
                const candidateTheta = this.orbitTheta + sign * angularStep * step;
                const candidatePosition = this.#positionForOrbit(candidateTheta);
                if (!blocksCpuLane(candidatePosition)) {
                    targetTheta = candidateTheta;
                    break;
                }
            }
            if (targetTheta != null) {
                break;
            }
        }
        if (targetTheta == null) {
            return false;
        }
        const angularDistance = Math.abs(angleDeltaDeg(THREE.MathUtils.radToDeg(targetTheta), THREE.MathUtils.radToDeg(this.orbitTheta)));
        this.orbitTheta = targetTheta;
        this.cpuSpectatorLocked = true;
        const position = this.#positionForOrbit(targetTheta);
        const target = this.tableCenter.clone();
        target.y = this.cueBallBody.position.y;
        const duration = THREE.MathUtils.clamp(0.45 + angularDistance / 150, 0.52, 0.82);
        this.#startTransition({
            position,
            quaternion: this.#lookQuaternion(position, target),
            up: new THREE.Vector3(0, 1, 0)
        }, duration, () => {
            this.phase = PlayerViewPhase.FREE;
            this.#applyCpuSpectatorLockCamera();
        });
        return true;
    }
    #applyCpuSpectatorLockCamera() {
        const position = this.#positionForOrbit(this.orbitTheta);
        const target = this.tableCenter.clone();
        target.y = this.cueBallBody.position.y;
        this.camera.position.copy(position);
        this.camera.quaternion.copy(this.#lookQuaternion(position, target));
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
    }
    isTopDownViewActive() {
        return (this.phase === PlayerViewPhase.TRANSITION && this.transition?.fromTopDown === true) || (this.phase === PlayerViewPhase.AIM && this.keys.has("j")) || (this.phase === PlayerViewPhase.POWER && this.keys.has("j"));
    }
    getPhase() {
        return this.phase;
    }

    //UPDATE LOOP
    update(dt) {
        if (this.paused) {
            return;
        }
        const ruleState = this.matchController.getRuleState();
        const currentPlayer = ruleState.currentPlayer;
        if (this.cinematicLocked) {
            this.hud.hidePower();
            this.hud.setState("");
            return;
        }
        if (this.lastRulePlayer === 1 && currentPlayer === 0 && !this.ballInHandSystem.isActive() && this.phase === PlayerViewPhase.FREE && this.lastHumanPreAimState) {
            this.#restoreFreeState(this.lastHumanPreAimState);
            this.#startTransition(this.#getFreeCameraPose(), PLAYER_VIEW.TURN_RETURN_DURATION, () => {
                this.phase = PlayerViewPhase.FREE;
                this.#showHeldCue();
            });
        }
        if (currentPlayer === 1) {
            this.cpuSpectatorLocked = true;
        }
        else if (this.lastRulePlayer === 1 && currentPlayer === 0) {
            this.cpuSpectatorLocked = false;
        }
        this.lastRulePlayer = currentPlayer;
        if (this.phase === PlayerViewPhase.TRANSITION) {
            this.#updateTransition(dt);
            this.#updateHud(ruleState);
            return;
        }
        if (this.phase === PlayerViewPhase.DISABLED) {
            this.#updateHud(ruleState);
            return;
        }
        if (this.phase === PlayerViewPhase.FREE) {
            if (currentPlayer === 1 || this.cpuSpectatorLocked) {
                this.enterRequested = false;
                this.cancelRequested = false;
                this.#applyCpuSpectatorLockCamera();
            }
            else {
                this.#updateFree(dt, ruleState);
            }
        }
        else if (this.phase === PlayerViewPhase.AIM) {
            this.#updateAim(dt);
        }
        else if (this.phase === PlayerViewPhase.POWER) {
            this.#updatePower(dt);
        }
        else if (this.phase === PlayerViewPhase.SHOT) {
            this.#updateShot();
        }
        this.#updateHud(ruleState);
    }

    //FREE VIEW
    #updateFree(dt, ruleState) {
        const moveDirection = (this.keys.has("q") ? 1 : 0) - (this.keys.has("e") ? 1 : 0);
        if (moveDirection !== 0) {
            const previousPosition = this.#positionForOrbit(this.orbitTheta);
            const proposedTheta = this.orbitTheta + moveDirection * PLAYER_VIEW.ORBIT_SPEED_RAD * dt;
            const proposedPosition = this.#positionForOrbit(proposedTheta);
            if (!this.cpuCueAnimator?.blocksPosition(proposedPosition)) {
                this.orbitTheta = proposedTheta;
                this.playerWalkDistance += previousPosition.distanceTo(proposedPosition);
                while (this.playerWalkDistance >= this.playerStepSpacing) {
                    this.playerWalkDistance -= this.playerStepSpacing;
                    this.audioManager?.playPlayerFootstep?.({ gain: 0.34 });
                }
            }
        }
        const lookYaw = (this.keys.has("a") ? 1 : 0) - (this.keys.has("d") ? 1 : 0);
        const lookPitch = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0);
        this.headYawDeg = THREE.MathUtils.clamp(this.headYawDeg + lookYaw * PLAYER_VIEW.HEAD_YAW_SPEED_DEG * dt, -PLAYER_VIEW.HEAD_YAW_LIMIT_DEG, PLAYER_VIEW.HEAD_YAW_LIMIT_DEG);
        this.headPitchDeg = THREE.MathUtils.clamp(this.headPitchDeg + lookPitch * PLAYER_VIEW.HEAD_PITCH_SPEED_DEG * dt, -PLAYER_VIEW.HEAD_PITCH_DOWN_LIMIT_DEG, PLAYER_VIEW.HEAD_PITCH_UP_LIMIT_DEG);
        this.#applyFreeCamera();
        const canAim = ruleState.currentPlayer === 0 && !ruleState.gameOverReason && this.matchController.phase === "AIMING" && !this.ballInHandSystem.isActive() && this.shotSystem.canShoot();
        if (this.enterRequested) {
            this.enterRequested = false;
            if (canAim) {
                this.#enterAim();
            }
        }
    }

    //AIMING
    #enterAim() {
        this.lastHumanPreAimState = this.#captureFreeState();
        this.savedFreeState = this.#captureFreeState();
        const playerPosition = this.#positionForOrbit(this.orbitTheta);
        const toBall = this.cueBallBody.position.clone().sub(playerPosition);
        toBall.y = 0;
        this.aimDistance = Math.max(0.001, toBall.length());
        if (toBall.lengthSq() < 1e-8) {
            toBall.set(0, 0, -1);
        }
        else {
            toBall.normalize();
        }
        const distanceT = THREE.MathUtils.clamp((this.aimDistance - PLAYER_VIEW.AIM_DISTANCE_NEAR) / (PLAYER_VIEW.AIM_DISTANCE_FAR - PLAYER_VIEW.AIM_DISTANCE_NEAR), 0, 1);
        const proximity = 1 - distanceT;
        this.aimYawFreedomDeg = THREE.MathUtils.lerp(PLAYER_VIEW.AIM_YAW_FREEDOM_FAR_DEG, PLAYER_VIEW.AIM_YAW_FREEDOM_NEAR_DEG, proximity);
        this.aimElevationMaxDeg = THREE.MathUtils.lerp(PLAYER_VIEW.AIM_ELEVATION_FAR_DEG, CUE_RIG.MAX_ELEVATION_DEG, proximity);
        const effectiveReach = Math.max(0, this.aimDistance - PLAYER_VIEW.TABLE_MARGIN);
        const farEffectiveReach = Math.max(this.kitchenDepth + 0.001, PLAYER_VIEW.AIM_DISTANCE_FAR - PLAYER_VIEW.TABLE_MARGIN);
        const powerT = THREE.MathUtils.clamp((effectiveReach - this.kitchenDepth) / (farEffectiveReach - this.kitchenDepth), 0, 1);
        this.maxPower = THREE.MathUtils.lerp(SHOT.MAX_POWER, PLAYER_VIEW.POWER_MAX_FAR, powerT);
        this.aimYawCenterDeg = yawForDirection(toBall);
        this.aimYawDeltaDeg = 0;
        this.cueRig.position.copy(this.cueBallBody.position);
        this.cueRig.setYawDeg(this.aimYawCenterDeg);
        this.clearanceSystem.update(true);
        this.aimElevationDeg = Math.max(CUE_RIG.DEFAULT_ELEVATION_DEG, this.cueRig.getMinimumElevationDeg());
        this.cueRig.setElevationDeg(Math.min(this.aimElevationMaxDeg, this.aimElevationDeg));
        this.shotSystem.setHitOffset(0, 0);
        this.cueRig.clearStrokeOffsetPreview();
        this.#hideHeldCue();
        this.cueRig.visible = true;
        this.contactMarker.visible = true;
        this.#setTrajectoryHold(false, true);
        const aimPose = this.#getAimCameraPose();
        this.#startTransition(aimPose, PLAYER_VIEW.AIM_TRANSITION_DURATION, () => {
            this.phase = PlayerViewPhase.AIM;
        });
    }
    #updateAim(dt) {
        const contact = this.shotSystem.getHitOffset();
        let u = contact.u;
        let v = contact.v;
        const contactSpeed = PLAYER_VIEW.CONTACT_SPEED * dt;
        if (this.keys.has("a"))
            u -= contactSpeed;
        if (this.keys.has("d"))
            u += contactSpeed;
        if (this.keys.has("w"))
            v += contactSpeed;
        if (this.keys.has("s"))
            v -= contactSpeed;
        if (u !== contact.u || v !== contact.v) {
            this.shotSystem.setHitOffset(u, v);
        }
        this.#applyAimSettings();
        this.#updateContactMarker();
        this.#setTrajectoryHold(this.keys.has("v"));
        this.#applyAimCamera(dt);
        if (this.cancelRequested) {
            this.cancelRequested = false;
            this.enterRequested = false;
            this.#leaveAimToFree();
            return;
        }
        if (this.enterRequested) {
            this.enterRequested = false;
            this.phase = PlayerViewPhase.POWER;
            this.powerNormalized = SHOT.MIN_POWER;
            this.powerDirection = 1;
            this.currentPower = SHOT.MIN_POWER;
            this.cueRig.setStrokeOffsetPreview(0);
        }
    }
    #updatePower(dt) {
        if (this.cancelRequested) {
            this.cancelRequested = false;
            this.enterRequested = false;
            this.phase = PlayerViewPhase.AIM;
            this.powerNormalized = SHOT.MIN_POWER;
            this.powerDirection = 1;
            this.currentPower = SHOT.MIN_POWER;
            this.cueRig.clearStrokeOffsetPreview();
            this.hud.hidePower();
            return;
        }
        if (this.enterRequested) {
            this.enterRequested = false;
            this.shotSystem.setPower(this.currentPower);
            if (this.shotSystem.requestShot({
                skipCharge: true
            })) {
                this.phase = PlayerViewPhase.SHOT;
                this.hud.hidePower();
                this.contactMarker.visible = false;
                this.#setTrajectoryHold(false, true);
            }
            return;
        }
        this.powerNormalized += this.powerDirection * PLAYER_VIEW.POWER_SWEEP_SPEED * dt;
        if (this.powerNormalized >= this.maxPower) {
            this.powerNormalized = this.maxPower;
            this.powerDirection = -1;
        }
        else if (this.powerNormalized <= SHOT.MIN_POWER) {
            this.powerNormalized = SHOT.MIN_POWER;
            this.powerDirection = 1;
        }
        this.currentPower = this.powerNormalized;
        const backswing = this.cueRig.getBackswingForPower(this.currentPower);
        this.cueRig.setStrokeOffsetPreview(backswing);
        this.#updateContactMarker();
        this.#setTrajectoryHold(this.keys.has("v"));
        this.#applyAimCamera(dt);
        this.hud.showPower({
            value01: this.powerNormalized,
            actualPower: this.currentPower,
            maxPower: this.maxPower
        });
    }
    #leaveAimToFree() {
        this.leftMouseDown = false;
        this.lastPointer = null;
        this.cueRig.visible = false;
        this.cueRig.clearStrokeOffsetPreview();
        this.contactMarker.visible = false;
        this.#setTrajectoryHold(false, true);
        this.hud.hidePower();
        if (this.savedFreeState) {
            this.#restoreFreeState(this.savedFreeState);
        }
        this.#startTransition(this.#getFreeCameraPose(), PLAYER_VIEW.AIM_TRANSITION_DURATION, () => {
            this.phase = PlayerViewPhase.FREE;
            this.#showHeldCue();
        });
    }

    //SHOT VIEW
    #updateShot() {
        this.#applyAimCamera(1 / 60);
        if (!this.cueRig.strokeActive && this.shotSystem.hasCommittedShot()) {
            this.cueRig.visible = false;
            this.cueRig.clearStrokeOffsetPreview();
            if (this.savedFreeState) {
                this.#restoreFreeState(this.savedFreeState);
            }
            this.#startTransition(this.#getFreeCameraPose(), PLAYER_VIEW.SHOT_RETURN_DURATION, () => {
                this.phase = PlayerViewPhase.FREE;
                this.#showHeldCue();
            });
        }
    }

    //CUE CONTROL
    #applyAimSettings() {
        const requestedYaw = this.aimYawCenterDeg + THREE.MathUtils.clamp(this.aimYawDeltaDeg, -this.aimYawFreedomDeg, this.aimYawFreedomDeg);
        this.cueRig.setYawDeg(requestedYaw);
        this.clearanceSystem.update(true);
        const actualYaw = this.cueRig.getYawDeg();
        this.aimYawDeltaDeg = THREE.MathUtils.clamp(angleDeltaDeg(actualYaw, this.aimYawCenterDeg), -this.aimYawFreedomDeg, this.aimYawFreedomDeg);
        const minElevation = this.cueRig.getMinimumElevationDeg();
        this.aimElevationDeg = THREE.MathUtils.clamp(this.aimElevationDeg, minElevation, Math.max(minElevation, this.aimElevationMaxDeg));
        this.cueRig.setElevationDeg(this.aimElevationDeg);
    }
    #applyAimCamera(dt) {
        let targetPose;
        if (this.keys.has("j")) {
            targetPose = this.topDownPose;
        }
        else if (this.keys.has("k")) {
            targetPose = this.#getHighThreeQuarterPose();
        }
        else {
            targetPose = this.#getAimCameraPose();
        }
        const blend = 1 - Math.exp(-PLAYER_VIEW.VIEW_OVERRIDE_SMOOTHING * dt);
        this.camera.position.lerp(targetPose.position, blend);
        this.camera.quaternion.slerp(targetPose.quaternion, blend);
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
    }
    #getAimCameraPose() {
        this.cueRig.updateWorldMatrix(true, true);
        const shotDirection = this.cueRig.getShotDirectionWorld(new THREE.Vector3());
        const tip = new THREE.Vector3();
        this.cueRig.strokePivot.getWorldPosition(tip);
        const position = tip.clone().addScaledVector(shotDirection, -PLAYER_VIEW.AIM_CAMERA_BACK).add(new THREE.Vector3(0, PLAYER_VIEW.AIM_CAMERA_UP, 0));
        const contactVector = this.cueRig.getContactVectorWorld(new THREE.Vector3());
        const target = this.cueBallBody.position.clone().add(contactVector);
        return {
            position,
            quaternion: this.#lookQuaternion(position, target),
            up: new THREE.Vector3(0, 1, 0)
        };
    }
    #getHighThreeQuarterPose() {
        const cueBallPosition = this.cueBallBody.position.clone();
        const cueDirection = this.cueRig.getShotDirectionWorld(new THREE.Vector3()).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        // Direction perpendicular to the cue that points as much as possible toward world-up.
        const cueNormal = worldUp.clone().addScaledVector(cueDirection, -worldUp.dot(cueDirection));
        if (cueNormal.lengthSq() < 1e-8) {
            cueNormal.set(0, 0, 1);
        }
        else {
            cueNormal.normalize();
        }
        // Reduce the distance from the cue as its elevation grows.
        // 0 deg  -> scale 1.0
        // 60 deg -> scale 0.5
        const elevationRad = THREE.MathUtils.degToRad(this.cueRig.getElevationDeg());
        const normalOffsetScale = Math.pow(Math.cos(elevationRad), 2);
        // Move backwards following the actual 3D cue axis.
        const position = cueBallPosition.clone().addScaledVector(cueDirection, -(PLAYER_VIEW.AIM_CAMERA_BACK + PLAYER_VIEW.THREE_QUARTER_BACK));
        // Move "above" the cue along its normal.
        position.addScaledVector(cueNormal, PLAYER_VIEW.THREE_QUARTER_RISE * normalOffsetScale);
        // Camera looks forward across the playing surface.
        const tableDirection = new THREE.Vector3(cueDirection.x, 0, cueDirection.z);
        if (tableDirection.lengthSq() < 1e-8) {
            tableDirection.set(0, 0, -1);
        }
        else {
            tableDirection.normalize();
        }
        const target = cueBallPosition.clone().addScaledVector(tableDirection, PLAYER_VIEW.THREE_QUARTER_LOOK_AHEAD);
        target.y = cueBallPosition.y;
        return {
            position,
            quaternion: this.#lookQuaternion(position, target),
            up: worldUp
        };
    }
    #updateContactMarker() {
        const contactVector = this.cueRig.getContactVectorWorld(new THREE.Vector3());
        this.contactMarker.position.copy(this.cueBallBody.position).addScaledVector(contactVector, 1.035);
        this.contactMarker.visible = this.phase === PlayerViewPhase.AIM || this.phase === PlayerViewPhase.POWER;
    }
    #updateHud(ruleState) {
        if (this.phase === PlayerViewPhase.FREE) {
            const canAim = ruleState.currentPlayer === 0 && this.matchController.phase === "AIMING" && this.shotSystem.canShoot();
            this.hud.setState(ruleState.currentPlayer === 1 ? "KILL TURN · spectator view locked on the table" : (canAim ? "Q/E walk around the table · WASD look · Enter to aim" : "Q/E walk around the table · WASD look"));
            this.hud.hidePower();
        }
        else if (this.phase === PlayerViewPhase.AIM) {
            this.hud.setState(`AIM · LMB drag: yaw/elevation · WASD: cue-ball contact · hold V: trajectory · hold J: BEV · hold K: high view · Enter: power · Space: cancel`);
        }
        else if (this.phase === PlayerViewPhase.POWER) {
            this.hud.setState("POWER · hold V: trajectory · Enter: shoot · Space: back to aim");
        }
        else if (this.phase === PlayerViewPhase.SHOT) {
            this.hud.setState("");
        }
    }
    #captureFreeState() {
        return {
            orbitTheta: this.orbitTheta,
            orbitScale: this.orbitScale,
            headYawDeg: this.headYawDeg,
            headPitchDeg: this.headPitchDeg
        };
    }
    #restoreFreeState(state) {
        this.orbitTheta = state.orbitTheta;
        this.orbitScale = state.orbitScale;
        this.headYawDeg = state.headYawDeg;
        this.headPitchDeg = state.headPitchDeg;
    }
    #positionForOrbit(theta) {
        return new THREE.Vector3(this.tableCenter.x + Math.cos(theta) * this.baseOrbitRadiusX * this.orbitScale, PLAYER_VIEW.EYE_HEIGHT, this.tableCenter.z + Math.sin(theta) * this.baseOrbitRadiusZ * this.orbitScale);
    }
    #applyFreeCamera() {
        const pose = this.#getFreeCameraPose();
        this.camera.position.copy(pose.position);
        this.camera.quaternion.copy(pose.quaternion);
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
    }
    #getFreeCameraPose() {
        const position = this.#positionForOrbit(this.orbitTheta);
        const forward = this.tableCenter.clone().sub(position);
        forward.y = 0;
        forward.normalize();
        const bodyYaw = THREE.MathUtils.degToRad(yawForDirection(forward));
        const yaw = bodyYaw + THREE.MathUtils.degToRad(this.headYawDeg);
        const pitch = THREE.MathUtils.degToRad(this.headPitchDeg);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        return {
            position,
            quaternion,
            up: new THREE.Vector3(0, 1, 0)
        };
    }
    #lookQuaternion(position, target) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, new THREE.Vector3(0, 1, 0));
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }

    //CAMERA TRANSITIONS
    #startTransition(targetPose, duration, onComplete = null) {
        this.transition = {
            startPosition: this.camera.position.clone(),
            startQuaternion: this.camera.quaternion.clone(),
            endPosition: targetPose.position.clone(),
            endQuaternion: targetPose.quaternion.clone(),
            duration,
            elapsed: 0,
            onComplete,
            fromTopDown: this.camera.position.distanceTo(this.topDownPose.position) < 0.25
        };
        this.phase = PlayerViewPhase.TRANSITION;
    }
    #updateTransition(dt) {
        if (!this.transition) {
            this.phase = PlayerViewPhase.FREE;
            return;
        }
        this.transition.elapsed += dt;
        const raw = this.transition.elapsed / this.transition.duration;
        const t = easeInOutCubic(raw);
        this.camera.position.lerpVectors(this.transition.startPosition, this.transition.endPosition, t);
        this.camera.quaternion.slerpQuaternions(this.transition.startQuaternion, this.transition.endQuaternion, t);
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
        if (raw >= 1) {
            const callback = this.transition.onComplete;
            this.transition = null;
            callback?.();
        }
    }
    #showHeldCue() {
        this.pubEnvironment.showGameplayHeldCue?.(this.camera);
    }
    #hideHeldCue() {
        this.pubEnvironment.hideGameplayHeldCue?.();
    }

    //INPUT
    #onKeyDown(event) {
        if (this.paused || this.cinematicLocked) {
            return;
        }
        const target = event.target;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "enter") {
            if (!event.repeat && !this.blockEnterUntilReleased && !this.ballInHandSystem.isActive()) {
                this.enterRequested = true;
                event.preventDefault();
            }
            return;
        }
        if (key === " ") {
            if (!event.repeat && (this.phase === PlayerViewPhase.AIM || this.phase === PlayerViewPhase.POWER)) {
                this.cancelRequested = true;
                event.preventDefault();
            }
            return;
        }
        if (key === "v") {
            this.keys.add(key);
            if (this.phase === PlayerViewPhase.AIM || this.phase === PlayerViewPhase.POWER) {
                this.#setTrajectoryHold(true);
            }
            event.preventDefault();
            return;
        }
        if (["w", "a", "s", "d", "q", "e", "j", "k"].includes(key)) {
            this.keys.add(key);
            event.preventDefault();
        }
    }
    #onKeyUp(event) {
        const key = event.key.toLowerCase();
        if (key === "enter") {
            this.blockEnterUntilReleased = false;
        }
        if (key === "v") {
            this.#setTrajectoryHold(false, true);
        }
        this.keys.delete(key);
    }
    #onPointerDown(event) {
        if (this.paused || this.cinematicLocked) {
            return;
        }
        if (event.button !== 0 || this.phase !== PlayerViewPhase.AIM) {
            return;
        }
        this.leftMouseDown = true;
        this.lastPointer = {
            x: event.clientX,
            y: event.clientY
        };
        event.preventDefault();
    }
    #onPointerUp(event) {
        if (event.button === 0) {
            this.leftMouseDown = false;
            this.lastPointer = null;
        }
    }
    #onPointerMove(event) {
        if (this.paused || this.cinematicLocked) {
            return;
        }
        if (!this.leftMouseDown || this.phase !== PlayerViewPhase.AIM || !this.lastPointer) {
            return;
        }
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.lastPointer.x = event.clientX;
        this.lastPointer.y = event.clientY;
        this.aimYawDeltaDeg = THREE.MathUtils.clamp(this.aimYawDeltaDeg - dx * PLAYER_VIEW.MOUSE_YAW_DEG_PER_PIXEL, -this.aimYawFreedomDeg, this.aimYawFreedomDeg);
        this.aimElevationDeg = THREE.MathUtils.clamp(this.aimElevationDeg + dy * PLAYER_VIEW.MOUSE_ELEVATION_DEG_PER_PIXEL, CUE_RIG.MIN_ELEVATION_DEG, this.aimElevationMaxDeg);
        this.#applyAimSettings();
        event.preventDefault();
    }

    //CLEANUP
    dispose() {
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
        this.canvas.removeEventListener("pointerdown", this._onPointerDown);
        window.removeEventListener("pointerup", this._onPointerUp);
        window.removeEventListener("pointermove", this._onPointerMove);
        this.contactMarker.geometry.dispose();
        this.contactMarker.material.dispose();
        this.contactMarker.removeFromParent();
    }
}
