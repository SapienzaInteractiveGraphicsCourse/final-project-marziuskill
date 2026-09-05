//Sequences the opening camera path, pub reveal and introductory interactions.

//DEPENDENCIES
import * as THREE from "three";

//EASING
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
function easeInOutCubic(t) {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutCubic(t) {
    const x = clamp01(t);
    return 1 - Math.pow(1 - x, 3);
}
function easeInOutSine(t) {
    const x = clamp01(t);
    return -(Math.cos(Math.PI * x) - 1) / 2;
}
function sleep(ms) {
    return new Promise(resolve => {
        window.setTimeout(resolve, ms);
    });
}

//INTRO TUNING
const WALK = Object.freeze({
    EYE_HEIGHT: 1.67,
    ENTRY_SPEED: 0.72,
    INDOOR_SPEED: 0.82,
    HEAD_BOB_AMPLITUDE: 0.010,
    STRIDE_LENGTH: 0.72,
    LOOK_AHEAD: 1.65,
    CORNER_TRIM_MAX: 0.46,
    CORNER_TRIM_FRACTION: 0.40,
    CORNER_CONTROL_FRACTION: 0.68,
    HEADING_SAMPLE_DISTANCE: 0.16,
    HEADING_RESPONSE: 6.5
});

//INTRO SEQUENCE
export class IntroSequence {

    //INITIALIZATION
    constructor({ camera, controls, pubEnvironment, scoreboardSystem, topDownPose, tableBox = null, kitchenPoint = null, audioManager = null }) {
        this.camera = camera;
        this.controls = controls;
        this.pubEnvironment = pubEnvironment;
        this.scoreboardSystem = scoreboardSystem;
        this.audioManager = audioManager;
        this.topDownPose = topDownPose;
        this.preBevPose = null;
        this.tableBox = tableBox?.clone?.() ?? null;
        this.kitchenPoint = kitchenPoint?.clone?.() ?? null;
        this.fade = document.createElement("div");
        this.fade.id = "cinematic-fade";
        this.fade.style.opacity = "1";
        document.body.appendChild(this.fade);
    }

    //START STATE
    prepareBlack() {
        this.fade.style.opacity = "1";
    }
    #audioDurationMs(name, fallbackMs) {
        const seconds = this.audioManager?.getDuration?.(name) ?? 0;
        return seconds > 0 ? seconds * 1000 : fallbackMs;
    }
    #playAt(name, position, options = {}) {
        return this.audioManager?.play?.(name, {
            position,
            refDistance: 0.85,
            maxDistance: 11,
            rolloffFactor: 1.05,
            ...options
        });
    }

    //SEQUENCE
    //The intro owns the camera until it explicitly hands the final pose back to gameplay.
    async play() {
        if (this.controls) {
            this.controls.enabled = false;
        }
        this.camera.up.set(0, 1, 0);
        this.pubEnvironment.resetIntroAnimation();
        this.scoreboardSystem.drawIntro(0);
        this.audioManager?.startCutsceneBed?.({
            fadeIn: 0.75
        });
        this.#setCameraLookAt(new THREE.Vector3(0, WALK.EYE_HEIGHT, 8.70), new THREE.Vector3(0, 1.55, 4.95));
        await sleep(240);
        await this.#fadeTo(0, 1050);
        await sleep(850);
        const entranceDoorPosition = this.pubEnvironment.getEntranceWorldCenter?.();
        this.#playAt("doorOpen", entranceDoorPosition, { gain: 0.64 });
        await this.#tweenValue(0, 1, this.#audioDurationMs("doorOpen", 1250), value => {
            this.pubEnvironment.setEntranceDoorOpenProgress(value);
        }, easeInOutCubic);
        await sleep(300);
        await this.#walkPath([
            new THREE.Vector3(0, WALK.EYE_HEIGHT, 4.28)
        ], WALK.ENTRY_SPEED);
        await sleep(220);
        this.#playAt("doorClose", entranceDoorPosition, { gain: 0.62 });
        await this.#tweenValue(1, 0, this.#audioDurationMs("doorClose", 720), value => {
            this.pubEnvironment.setEntranceDoorOpenProgress(value);
        }, t => t * t);
        await sleep(180);
        await this.#turnCamera(new THREE.Vector3(2.45, 1.64, 5.02), 410, easeOutCubic);
        let rightWindowCloseSoundStarted = false;
        await this.#tweenValue(0, 1, this.#audioDurationMs("windowClose", 330), value => {
            if (!rightWindowCloseSoundStarted && value >= 0.72) {
                rightWindowCloseSoundStarted = true;
                this.#playAt("windowClose", this.pubEnvironment.getWindowWorldCenter?.(1), { gain: 0.64 });
            }
            this.pubEnvironment.setWindowClosedProgress(1, value);
        }, t => t * t);
        await sleep(210);
        await this.#turnCamera(new THREE.Vector3(-2.45, 1.64, 5.02), 650, easeInOutCubic);
        let leftWindowCloseSoundStarted = false;
        await this.#tweenValue(0, 1, this.#audioDurationMs("windowClose", 330), value => {
            if (!leftWindowCloseSoundStarted && value >= 0.72) {
                leftWindowCloseSoundStarted = true;
                this.#playAt("windowClose", this.pubEnvironment.getWindowWorldCenter?.(0), { gain: 0.64 });
            }
            this.pubEnvironment.setWindowClosedProgress(0, value);
        }, t => t * t);
        await sleep(260);
        await this.#turnCamera(new THREE.Vector3(0, 1.20, 0.68), 520, easeOutCubic);
        await this.#turnCamera(new THREE.Vector3(-2.55, 1.20, -3.65), 900, easeInOutCubic);
        await sleep(280);
        await this.#turnCamera(new THREE.Vector3(0.10, 0.95, 0.68), 760, easeInOutCubic);
        await sleep(220);
        const cueRackTarget = this.pubEnvironment.getIntroCueWorldPosition()?.clone() ?? new THREE.Vector3(3.30, 1.35, -1.20);
        await this.#turnCamera(cueRackTarget, 820, easeInOutCubic);
        const cueFallDurationMs = this.#audioDurationMs("cueFall", 975);
        const cueFallImpactMs = (this.audioManager?.getMarker?.("cueFall", "impact", 0.114) ?? 0.114) * 1000;
        const cueFallSoundStartMs = Math.max(0, cueFallDurationMs - cueFallImpactMs);
        const cueFallSoundPosition = this.pubEnvironment.getIntroCueFallenWorldPosition?.() ?? cueRackTarget;
        let cueFallSoundStarted = false;
        await this.#tweenValue(0, 1, cueFallDurationMs, (value, rawProgress) => {
            const elapsedMs = rawProgress * cueFallDurationMs;
            if (!cueFallSoundStarted && elapsedMs >= cueFallSoundStartMs) {
                cueFallSoundStarted = true;
                this.#playAt("cueFall", cueFallSoundPosition, { gain: 0.70 });
            }
            this.pubEnvironment.setIntroCueFallProgress(value);
            const trackedCue = this.pubEnvironment.getIntroCueWorldPosition()?.clone();
            if (trackedCue) {
                const desired = this.#lookQuaternion(this.camera.position, trackedCue, new THREE.Vector3(0, 1, 0));
                this.camera.quaternion.slerp(desired, 0.14);
                this.camera.updateMatrixWorld(true);
            }
        }, t => t * t);
        await sleep(430);
        const fallenCue = this.pubEnvironment.getIntroCueWorldPosition()?.clone() ?? new THREE.Vector3(3.12, 0.06, -0.75);
        const cueWalkPath = [
            new THREE.Vector3(1.20, WALK.EYE_HEIGHT, 2.45),
            new THREE.Vector3(1.28, WALK.EYE_HEIGHT, 1.35),
            new THREE.Vector3(1.30, WALK.EYE_HEIGHT, -0.42),
            new THREE.Vector3(1.95, WALK.EYE_HEIGHT, -1.20),
            new THREE.Vector3(2.42, WALK.EYE_HEIGHT, -1.38)
        ];
        await this.#turnTowardWalkPoint(cueWalkPath[0], 650);
        await this.#walkPath(cueWalkPath.slice(0, 2), WALK.INDOOR_SPEED);
        await this.#walkPath(cueWalkPath.slice(2), WALK.INDOOR_SPEED, {
            lookTargetProvider: () => this.pubEnvironment.getIntroCueWorldPosition()?.clone() ?? fallenCue.clone()
        });
        await sleep(110);
        this.pubEnvironment.attachIntroCueToCamera(this.camera);
        this.#playAt("cueRackTouch", this.pubEnvironment.getIntroCueWorldPosition?.(), { gain: 0.48 });
        await this.#tweenValue(0, 1, 900, value => {
            this.pubEnvironment.setIntroCueHeldProgress(value);
        }, easeInOutCubic);
        await sleep(260);
        const scoreboardTarget = this.pubEnvironment.getScoreboardWorldCenter()?.clone() ?? new THREE.Vector3(-3.70, 1.65, -0.90);
        await this.#turnCamera(scoreboardTarget, 1750, easeInOutCubic);
        await sleep(360);
        const chalkShortMs = this.#audioDurationMs("chalkShort", 250);
        const chalkLongMs = this.#audioDurationMs("chalkLong", 975);
        const scoreboardWriteMs = chalkShortMs + chalkLongMs * 2;
        const scoreboardPosition = this.pubEnvironment.getScoreboardWorldCenter?.();
        let marziusChalkStarted = false;
        let killChalkStarted = false;
        this.#playAt("chalkShort", scoreboardPosition, { gain: 0.34 });
        await this.#tweenValue(0, 1, scoreboardWriteMs, value => {
            const elapsed = value * scoreboardWriteMs;
            if (!marziusChalkStarted && elapsed >= chalkShortMs) {
                marziusChalkStarted = true;
                this.#playAt("chalkLong", scoreboardPosition, { gain: 0.48 });
            }
            if (!killChalkStarted && elapsed >= chalkShortMs + chalkLongMs) {
                killChalkStarted = true;
                this.#playAt("chalkLong", scoreboardPosition, { gain: 0.48 });
            }
            this.scoreboardSystem.drawIntro(value);
        }, t => t);
        await sleep(620);
        const finalTablePose = this.#computeTableSidePose();
        const tableWalkPath = this.#buildTableWalkPath(finalTablePose.position);
        if (tableWalkPath.length > 0) {
            await this.#turnTowardWalkPoint(tableWalkPath[0], 760);
            await this.#walkPath(tableWalkPath, WALK.INDOOR_SPEED);
        }
        await sleep(180);
        await this.#turnCamera(finalTablePose.target, 1000, easeInOutCubic);
        await sleep(260);
        this.preBevPose = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            up: this.camera.up.clone(),
            near: this.camera.near,
            far: this.camera.far,
            controlsTarget: finalTablePose.target.clone(),
            controlsEnabled: false
        };
        this.pubEnvironment.hideHeldIntroCue();
        this.audioManager?.stopCutsceneBed?.({
            fadeOut: 0.90
        });
        await sleep(80);
    }
    skipToTable() {
        if (this.controls) {
            this.controls.enabled = false;
        }
        this.pubEnvironment.resetIntroAnimation();
        this.pubEnvironment.setEntranceDoorOpenProgress?.(0);
        this.pubEnvironment.setWindowClosedProgress?.(0, 1);
        this.pubEnvironment.setWindowClosedProgress?.(1, 1);
        this.scoreboardSystem.drawIntro?.(1);
        const finalTablePose = this.#computeTableSidePose();
        this.#setCameraLookAt(finalTablePose.position, finalTablePose.target);
        this.preBevPose = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            up: this.camera.up.clone(),
            near: this.camera.near,
            far: this.camera.far,
            controlsTarget: finalTablePose.target.clone(),
            controlsEnabled: false
        };
        this.fade.style.opacity = "0";
        this.pubEnvironment.hideHeldIntroCue();
        this.audioManager?.stopCutsceneBed?.({
            fadeOut: 0
        });
        return this.getPreBevPose();
    }
    getPreBevPose() {
        if (!this.preBevPose) {
            return null;
        }
        return {
            position: this.preBevPose.position.clone(),
            quaternion: this.preBevPose.quaternion.clone(),
            up: this.preBevPose.up.clone(),
            near: this.preBevPose.near,
            far: this.preBevPose.far,
            controlsTarget: this.preBevPose.controlsTarget.clone(),
            controlsEnabled: this.preBevPose.controlsEnabled
        };
    }
    dispose() {
        this.fade?.remove();
    }

    //FADES
    async #fadeTo(opacity, duration) {
        const start = Number.parseFloat(this.fade.style.opacity || "0");
        await this.#tweenValue(start, opacity, duration, value => {
            this.fade.style.opacity = String(value);
        }, easeInOutCubic);
    }
    #setCameraLookAt(position, target) {
        this.camera.position.copy(position);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(target);
        this.camera.updateMatrixWorld(true);
    }

    //CAMERA MOTION
    async #moveCamera(endPosition, endTarget, duration, easing) {
        const startPosition = this.camera.position.clone();
        const startQuaternion = this.camera.quaternion.clone();
        const endQuaternion = this.#lookQuaternion(endPosition, endTarget, new THREE.Vector3(0, 1, 0));
        await this.#tweenValue(0, 1, duration, value => {
            this.camera.position.lerpVectors(startPosition, endPosition, value);
            this.camera.quaternion.slerpQuaternions(startQuaternion, endQuaternion, value);
            this.camera.up.set(0, 1, 0);
            this.camera.updateMatrixWorld(true);
        }, easing);
    }

    //WALKING
    async #walkPath(waypoints, speed, { lookTargetProvider = null } = {}) {
        if (!waypoints?.length) {
            return;
        }
        const start = this.camera.position.clone();
        start.y = WALK.EYE_HEIGHT;
        const points = [
            start,
            ...waypoints.map(point => new THREE.Vector3(point.x, WALK.EYE_HEIGHT, point.z))
        ];
        const curve = new THREE.CurvePath();
        if (points.length === 2) {
            curve.add(new THREE.LineCurve3(points[0], points[1]));
        }
        else {
            let current = points[0].clone();
            for (let i = 1; i < points.length - 1; i += 1) {
                const previous = points[i - 1];
                const corner = points[i];
                const next = points[i + 1];
                const incoming = corner.clone().sub(previous);
                const outgoing = next.clone().sub(corner);
                const incomingLength = incoming.length();
                const outgoingLength = outgoing.length();
                if (incomingLength < 1e-5 || outgoingLength < 1e-5) {
                    continue;
                }
                incoming.normalize();
                outgoing.normalize();
                const trim = Math.min(WALK.CORNER_TRIM_MAX, incomingLength * WALK.CORNER_TRIM_FRACTION, outgoingLength * WALK.CORNER_TRIM_FRACTION);
                const entry = corner.clone().addScaledVector(incoming, -trim);
                const exit = corner.clone().addScaledVector(outgoing, trim);
                if (current.distanceToSquared(entry) > 1e-8) {
                    curve.add(new THREE.LineCurve3(current.clone(), entry.clone()));
                }
                const controlDistance = trim * WALK.CORNER_CONTROL_FRACTION;
                curve.add(new THREE.CubicBezierCurve3(entry.clone(), entry.clone().addScaledVector(incoming, controlDistance), exit.clone().addScaledVector(outgoing, -controlDistance), exit.clone()));
                current = exit;
            }
            const finalPoint = points[points.length - 1];
            if (current.distanceToSquared(finalPoint) > 1e-8) {
                curve.add(new THREE.LineCurve3(current.clone(), finalPoint.clone()));
            }
        }
        const length = Math.max(0.001, curve.getLength());
        const duration = Math.max(450, length / Math.max(0.1, speed) * 1000);
        const smoothedQuaternion = this.camera.quaternion.clone();
        let previousTweenValue = 0;
        let nextFootstepDistance = WALK.STRIDE_LENGTH * 0.25;
        const footstepSpacing = WALK.STRIDE_LENGTH * 0.50;
        await this.#tweenValue(0, 1, duration, value => {
            const travel = easeInOutSine(value);
            const position = curve.getPointAt(travel);
            const headingWindow = THREE.MathUtils.clamp(WALK.HEADING_SAMPLE_DISTANCE / length, 0.008, 0.08);
            const headingFrom = curve.getPointAt(Math.max(0, travel - headingWindow));
            const headingTo = curve.getPointAt(Math.min(1, travel + headingWindow));
            const tangent = headingTo.sub(headingFrom);
            if (tangent.lengthSq() < 1e-8) {
                tangent.copy(curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, travel))));
            }
            tangent.normalize();
            const envelope = Math.sin(Math.PI * value);
            const travelled = length * travel;
            if (travelled >= nextFootstepDistance) {
                this.audioManager?.playPubFootstep?.({
                    gain: 0.42
                });
                nextFootstepDistance += footstepSpacing;
            }
            const bob = Math.sin(travelled / WALK.STRIDE_LENGTH * Math.PI * 2) * WALK.HEAD_BOB_AMPLITUDE * envelope;
            position.y = WALK.EYE_HEIGHT + bob;
            this.camera.position.copy(position);
            let lookTarget = null;
            if (lookTargetProvider) {
                const tracked = lookTargetProvider();
                if (tracked && Number.isFinite(tracked.x) && Number.isFinite(tracked.y) && Number.isFinite(tracked.z)) {
                    lookTarget = tracked.clone();
                }
            }
            if (!lookTarget) {
                lookTarget = position.clone().addScaledVector(tangent, WALK.LOOK_AHEAD);
                lookTarget.y -= 0.09;
            }
            const desiredQuaternion = this.#lookQuaternion(position, lookTarget, new THREE.Vector3(0, 1, 0));
            const frameSeconds = Math.max(1 / 240, (value - previousTweenValue) * duration / 1000);
            previousTweenValue = value;
            const orientationBlend = 1 - Math.exp(-WALK.HEADING_RESPONSE * frameSeconds);
            smoothedQuaternion.slerp(desiredQuaternion, orientationBlend);
            this.camera.quaternion.copy(smoothedQuaternion);
            this.camera.up.set(0, 1, 0);
            this.camera.updateMatrixWorld(true);
        });
        const finalPoint = waypoints[waypoints.length - 1];
        this.camera.position.set(finalPoint.x, WALK.EYE_HEIGHT, finalPoint.z);
        this.camera.updateMatrixWorld(true);
    }
    async #turnTowardWalkPoint(point, duration) {
        const target = new THREE.Vector3(point.x, WALK.EYE_HEIGHT - 0.08, point.z);
        await this.#turnCamera(target, duration, easeInOutCubic);
    }

    //TABLE APPROACH
    #computeTableSidePose() {
        if (!this.tableBox || !this.kitchenPoint) {
            return {
                position: new THREE.Vector3(0, WALK.EYE_HEIGHT, -1.42),
                target: new THREE.Vector3(0, 0.98, 0.68)
            };
        }
        const center = this.tableBox.getCenter(new THREE.Vector3());
        const kitchenDirection = this.kitchenPoint.clone().sub(center);
        kitchenDirection.y = 0;
        if (kitchenDirection.lengthSq() < 1e-8) {
            kitchenDirection.set(0, 0, -1);
        }
        kitchenDirection.normalize();
        const tableSize = this.tableBox.getSize(new THREE.Vector3());
        const kitchenHalfExtent = Math.abs(kitchenDirection.x) * tableSize.x / 2 + Math.abs(kitchenDirection.z) * tableSize.z / 2;
        const standingDistance = kitchenHalfExtent + 0.72;
        const position = center.clone().addScaledVector(kitchenDirection, standingDistance);
        position.y = WALK.EYE_HEIGHT;
        const target = center.clone();
        target.y = Math.max(0.95, this.tableBox.max.y + 0.08);
        return {
            position,
            target,
            kitchenDirection
        };
    }
    #buildTableWalkPath(finalPosition) {
        if (!this.tableBox) {
            return [
                new THREE.Vector3(1.35, WALK.EYE_HEIGHT, -0.92),
                finalPosition.clone()
            ];
        }
        const center = this.tableBox.getCenter(new THREE.Vector3());
        const tableSize = this.tableBox.getSize(new THREE.Vector3());
        const kitchenDirection = finalPosition.clone().sub(center);
        kitchenDirection.y = 0;
        if (kitchenDirection.lengthSq() < 1e-8) {
            kitchenDirection.set(0, 0, -1);
        }
        kitchenDirection.normalize();
        const sideDirection = new THREE.Vector3(-kitchenDirection.z, 0, kitchenDirection.x).normalize();
        const kitchenHalfExtent = Math.abs(kitchenDirection.x) * tableSize.x / 2 + Math.abs(kitchenDirection.z) * tableSize.z / 2;
        const sideHalfExtent = Math.abs(sideDirection.x) * tableSize.x / 2 + Math.abs(sideDirection.z) * tableSize.z / 2;
        const shortEndCenter = center.clone().addScaledVector(kitchenDirection, kitchenHalfExtent + 0.64);
        const cornerA = shortEndCenter.clone().addScaledVector(sideDirection, sideHalfExtent + 0.66);
        const cornerB = shortEndCenter.clone().addScaledVector(sideDirection, -(sideHalfExtent + 0.66));
        const current = this.camera.position;
        const approachCorner = current.distanceToSquared(cornerA) <= current.distanceToSquared(cornerB) ? cornerA : cornerB;
        approachCorner.y = WALK.EYE_HEIGHT;
        const final = finalPosition.clone();
        final.y = WALK.EYE_HEIGHT;
        return [
            approachCorner,
            final
        ];
    }
    async #turnCamera(target, duration, easing) {
        const position = this.camera.position.clone();
        const startQuaternion = this.camera.quaternion.clone();
        const endQuaternion = this.#lookQuaternion(position, target, new THREE.Vector3(0, 1, 0));
        await this.#tweenValue(0, 1, duration, value => {
            this.camera.quaternion.slerpQuaternions(startQuaternion, endQuaternion, value);
            this.camera.updateMatrixWorld(true);
        }, easing);
    }
    async #tweenCameraToPose(pose, duration, easing) {
        const startPosition = this.camera.position.clone();
        const startQuaternion = this.camera.quaternion.clone();
        const startUp = this.camera.up.clone();
        const startNear = this.camera.near;
        const startFar = this.camera.far;
        await this.#tweenValue(0, 1, duration, value => {
            this.camera.position.lerpVectors(startPosition, pose.position, value);
            this.camera.quaternion.slerpQuaternions(startQuaternion, pose.quaternion, value);
            this.camera.up.lerpVectors(startUp, pose.up, value).normalize();
            this.camera.near = THREE.MathUtils.lerp(startNear, pose.near, value);
            this.camera.far = THREE.MathUtils.lerp(startFar, pose.far, value);
            this.camera.updateProjectionMatrix();
            this.camera.updateMatrixWorld(true);
        }, easing);
    }
    #lookQuaternion(position, target, up) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, up);
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }
    #tweenValue(from, to, duration, onUpdate, easing = t => t) {
        return new Promise(resolve => {
            const start = performance.now();
            const step = now => {
                const raw = duration <= 0 ? 1 : (now - start) / duration;
                const t = clamp01(raw);
                const eased = easing(t);
                onUpdate(THREE.MathUtils.lerp(from, to, eased), t);
                if (t >= 1) {
                    resolve();
                    return;
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }
}
