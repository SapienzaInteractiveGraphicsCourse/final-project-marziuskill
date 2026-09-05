//Runs the victory and defeat timelines without changing the underlying match result.

//DEPENDENCIES
import * as THREE from "three";
import { PLAYER_VIEW, PUB_ENVIRONMENT } from "../config/constants.js";

//CINEMATIC STATE
export const EndMatchResult = Object.freeze({
    VICTORY: "VICTORY",
    DEFEAT: "DEFEAT"
});
const Phase = Object.freeze({
    IDLE: "IDLE",
    FINAL_SHOT_HOLD: "FINAL_SHOT_HOLD",
    WIN_LIGHTS: "WIN_LIGHTS",
    WIN_RISE: "WIN_RISE",
    WIN_WALK_RACK: "WIN_WALK_RACK",
    WIN_STORE_CUE: "WIN_STORE_CUE",
    WIN_TURN_BOARD: "WIN_TURN_BOARD",
    WIN_BOARD_MESSAGE: "WIN_BOARD_MESSAGE",
    WIN_MOVE_CENTER: "WIN_MOVE_CENTER",
    WIN_TURN_EXIT: "WIN_TURN_EXIT",
    WIN_OPEN_PUB: "WIN_OPEN_PUB",
    LOSE_SALUTE: "LOSE_SALUTE",
    LOSE_MOVE_CENTER: "LOSE_MOVE_CENTER",
    LOSE_TURN_BOARD: "LOSE_TURN_BOARD",
    LOSE_SCOREBOARD: "LOSE_SCOREBOARD",
    LOSE_TURN_RACK: "LOSE_TURN_RACK",
    LOSE_CUES_RELEASE: "LOSE_CUES_RELEASE",
    LOSE_CUES_AIM: "LOSE_CUES_AIM",
    LOSE_SUSPENSE: "LOSE_SUSPENSE",
    LOSE_ATTACK: "LOSE_ATTACK",
    FINAL_OVERLAY: "FINAL_OVERLAY"
});
const DURATIONS = Object.freeze({
    FINAL_SHOT_HOLD: 0.50,
    WIN_LIGHTS: 0.95,
    WIN_RISE: 1.10,
    WIN_WALK_RACK: 4.25,
    WIN_STORE_CUE: 0.52,
    WIN_TURN_BOARD: 0.95,
    WIN_BOARD_MESSAGE: 1.45,
    WIN_MOVE_CENTER: 2.25,
    WIN_TURN_EXIT: 0.90,
    WIN_OPEN_PUB: 2.10,
    LOSE_SALUTE: 2.10,
    LOSE_MOVE_CENTER: 3.10,
    LOSE_TURN_BOARD: 0.72,
    LOSE_SCOREBOARD: 1.08,
    LOSE_TURN_RACK: 0.95,
    LOSE_CUES_RELEASE: 1.35,
    LOSE_CUES_AIM: 0.95,
    LOSE_SUSPENSE: 0.90,
    LOSE_ATTACK: 0.34
});
const WALK = Object.freeze({
    EYE_HEIGHT: PLAYER_VIEW.EYE_HEIGHT,
    HEAD_BOB_AMPLITUDE: 0.009,
    STRIDE_LENGTH: 0.76,
    LOOK_AHEAD: 1.55,
    CORNER_TRIM_MAX: 0.42,
    CORNER_TRIM_FRACTION: 0.38,
    CORNER_CONTROL_FRACTION: 0.66,
    HEADING_SAMPLE_DISTANCE: 0.15,
    HEADING_RESPONSE: 4.8,
    SPEED: 0.79,
    TABLE_CLEARANCE: 0.52
});

//EASING
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
function easeInCubic(value) {
    const x = clamp01(value);
    return x * x * x;
}
function easeInOutSine(value) {
    const x = clamp01(value);
    return -(Math.cos(Math.PI * x) - 1) / 2;
}

//END MATCH CINEMATIC
export class EndMatchCinematicController {

    //INITIALIZATION
    constructor({ scene, camera, pubEnvironment, scoreboardSystem, playerGameplayController, cpuCueAnimator, cueRig, gameplayHud, tableCenter, tableBox = null, debugStatusElement = null, onRematch = null, onMainMenu = null, audioManager = null }) {
        this.scene = scene;
        this.camera = camera;
        this.pubEnvironment = pubEnvironment;
        this.scoreboardSystem = scoreboardSystem;
        this.playerGameplayController = playerGameplayController;
        this.cpuCueAnimator = cpuCueAnimator;
        this.cueRig = cueRig;
        this.gameplayHud = gameplayHud;
        this.tableCenter = tableCenter.clone();
        this.tableBox = tableBox?.clone?.() ?? null;
        this.debugStatusElement = debugStatusElement;
        this.debugStatusWasVisible = false;
        this.onRematch = onRematch;
        this.onMainMenu = onMainMenu;
        this.audioManager = audioManager;
        this.chalkLongDuration = this.audioManager?.getDuration?.("chalkLong") ?? 0.975;
        this.chalkMediumDuration = this.audioManager?.getDuration?.("chalkMedium") ?? 0.495;
        this.winBoardDuration = this.chalkLongDuration + this.chalkMediumDuration;
        this.loseBoardDuration = this.chalkLongDuration * 2;
        this.doorOpenDuration = this.audioManager?.getDuration?.("doorOpen") ?? DURATIONS.WIN_OPEN_PUB;
        this.windowOpenDuration = this.audioManager?.getDuration?.("windowOpen") ?? DURATIONS.WIN_OPEN_PUB;
        this.winOpenPubDuration = Math.max(this.doorOpenDuration, this.windowOpenDuration);
        this.loseSaluteDuration = this.cpuCueAnimator?.getEndSaluteLeadDuration?.() ?? DURATIONS.LOSE_SALUTE;
        this.chalkCues = [];
        this.phase = Phase.IDLE;
        this.phaseTime = 0;
        this.result = null;
        this.reason = null;
        this.cameraMove = null;
        this.attackCues = [];
        this.tableLights = [];
        this._onKeyDown = this.#onKeyDown.bind(this);
        window.addEventListener("keydown", this._onKeyDown, true);
        this.overlay = this.#buildOverlay();
        document.body.appendChild(this.overlay.root);
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
    #beginChalkCues(cues) {
        this.chalkCues = cues.map(cue => ({
            ...cue,
            played: false
        }));
        this.#updateChalkCues(0);
    }
    #updateChalkCues(time) {
        const position = this.pubEnvironment.getScoreboardWorldCenter?.();
        for (const cue of this.chalkCues) {
            if (cue.played || time + 1e-4 < cue.time) {
                continue;
            }
            cue.played = true;
            this.#playAt(cue.sound, position, {
                gain: cue.gain ?? 0.78,
                refDistance: 2.2,
                maxDistance: 12,
                rolloffFactor: 0.72
            });
        }
    }
    #beginVictoryOpenAudio() {
        this.#playAt("doorOpen", this.pubEnvironment.getEntranceWorldCenter?.(), { gain: 0.64 });
        for (let index = 0; index < 2; index += 1) {
            this.#playAt("windowOpen", this.pubEnvironment.getWindowWorldCenter?.(index), { gain: 0.58 });
        }
    }
    #buildOverlay() {
        const root = document.createElement("div");
        root.id = "end-match-overlay";
        root.className = "end-match-overlay hidden";
        root.innerHTML = `
      <div class="end-match-overlay-content">
        <div class="end-match-title"></div>
        <div class="end-match-actions">
          <button type="button" data-action="rematch">Rematch</button>
          <span aria-hidden="true">·</span>
          <button type="button" data-action="menu">Main Menu</button>
        </div>
      </div>
    `;
        const title = root.querySelector(".end-match-title");
        root.querySelector('[data-action="rematch"]').addEventListener("click", () => this.#rematch());
        root.querySelector('[data-action="menu"]').addEventListener("click", () => this.onMainMenu?.());
        return { root, title };
    }
    #onKeyDown(event) {
        if (!this.isActive()) {
            return;
        }
        if (event.key === " " && !event.repeat) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.skip();
        }
    }
    isActive() {
        return this.phase !== Phase.IDLE;
    }
    getState() {
        return {
            active: this.isActive(),
            result: this.result,
            phase: this.phase,
            phaseTime: this.phaseTime,
            reason: this.reason
        };
    }

    //SEQUENCE CONTROL
    start(result, { reason = null } = {}) {
        if (this.isActive()) {
            return false;
        }
        this.result = result === EndMatchResult.DEFEAT ? EndMatchResult.DEFEAT : EndMatchResult.VICTORY;
        this.reason = reason;
        this.phase = Phase.FINAL_SHOT_HOLD;
        this.phaseTime = 0;
        this.cameraMove = null;
        this.attackCues = [];
        this.chalkCues = [];
        this.audioManager?.stopJukeboxAbrupt?.(this.pubEnvironment.getJukeboxWorldPosition?.());
        this.audioManager?.startCutsceneBed?.({
            fadeIn: 0.45
        });
        this.#captureTableLights();
        this.#hideOverlay();
        this.scoreboardSystem?.clearCinematicMessage?.();
        if (this.debugStatusElement) {
            this.debugStatusWasVisible = this.debugStatusElement.style.display !== "none";
            this.debugStatusElement.style.display = "none";
        }
        this.playerGameplayController?.setCinematicLock?.(true);
        this.gameplayHud?.hidePower?.();
        this.gameplayHud?.hideKillThinking?.();
        this.gameplayHud?.setState?.("");
        return true;
    }

    //LIGHTING
    #captureTableLights() {
        this.tableLights = [];
        const candidates = [];
        this.scene.traverse(object => {
            if (!object?.isLight) {
                return;
            }
            const name = object.name ?? "";
            if (name.includes("ScoreboardPictureLight") || name.includes("CueRackPictureLight")) {
                return;
            }
            const lower = name.toLowerCase();
            const namedTableLight = lower.includes("poollight") || lower.includes("tablelight") || lower.includes("table_light") || lower.includes("billiard") || lower.includes("cloth");
            const world = new THREE.Vector3();
            object.getWorldPosition?.(world);
            const spatialTableLight = (object.isPointLight || object.isSpotLight) && world.y > 2.25 && Math.abs(world.x - this.tableCenter.x) < 2.25 && Math.abs(world.z - this.tableCenter.z) < 2.40;
            if (namedTableLight || spatialTableLight) {
                candidates.push(object);
            }
        });
        for (const light of candidates) {
            this.tableLights.push({
                light,
                intensity: light.intensity,
                color: light.color?.clone?.() ?? null
            });
        }
    }
    #restoreTableLights() {
        for (const state of this.tableLights) {
            state.light.intensity = state.intensity;
            if (state.color && state.light.color) {
                state.light.color.copy(state.color);
            }
        }
    }
    #applyLightMood(amount, result = this.result) {
        const t = smoothstep01(amount);
        for (const state of this.tableLights) {
            if (result === EndMatchResult.VICTORY) {
                state.light.intensity = state.intensity;
                if (state.color && state.light.color) {
                    const warm = state.color.clone().lerp(new THREE.Color(0xffbf82), 0.18);
                    state.light.color.copy(state.color).lerp(warm, t);
                }
            }
            else {
                state.light.intensity = THREE.MathUtils.lerp(state.intensity, state.intensity * 0.85, t);
                if (state.color && state.light.color) {
                    state.light.color.copy(state.color);
                }
            }
        }
    }
    #lookQuaternion(position, target) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, new THREE.Vector3(0, 1, 0));
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }
    #buildWalkCurve(points) {
        const curve = new THREE.CurvePath();
        if (points.length === 2) {
            curve.add(new THREE.LineCurve3(points[0], points[1]));
            return curve;
        }
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
        return curve;
    }

    //CAMERA MOTION
    #startCameraMove(phase, endPosition, endTarget, duration) {
        this.phase = phase;
        this.phaseTime = 0;
        this.cameraMove = {
            type: "linear",
            startPosition: this.camera.position.clone(),
            startQuaternion: this.camera.quaternion.clone(),
            endPosition: endPosition.clone(),
            endQuaternion: this.#lookQuaternion(endPosition, endTarget),
            duration
        };
    }
    #startWalkMove(phase, waypoints, { speed = WALK.SPEED, finalLookTarget = null } = {}) {
        const start = this.camera.position.clone();
        start.y = WALK.EYE_HEIGHT;
        const points = [
            start,
            ...waypoints.map(point => new THREE.Vector3(point.x, WALK.EYE_HEIGHT, point.z))
        ];
        const curve = this.#buildWalkCurve(points);
        const length = Math.max(0.001, curve.getLength());
        const duration = Math.max(0.55, length / Math.max(0.20, speed));
        this.phase = phase;
        this.phaseTime = 0;
        this.cameraMove = {
            type: "walk",
            duration,
            curve,
            length,
            smoothedQuaternion: this.camera.quaternion.clone(),
            endPosition: points[points.length - 1].clone(),
            finalLookTarget: finalLookTarget?.clone?.() ?? null,
            nextFootstepDistance: WALK.STRIDE_LENGTH * 0.25,
            footstepSpacing: WALK.STRIDE_LENGTH * 0.50
        };
    }
    #updateCameraMove(dt) {
        if (!this.cameraMove) {
            return true;
        }
        if (this.cameraMove.type === "linear") {
            this.phaseTime += dt;
            const raw = this.phaseTime / Math.max(0.001, this.cameraMove.duration);
            const t = smootherstep01(raw);
            this.camera.position.lerpVectors(this.cameraMove.startPosition, this.cameraMove.endPosition, t);
            this.camera.quaternion.slerpQuaternions(this.cameraMove.startQuaternion, this.cameraMove.endQuaternion, t);
            this.camera.up.set(0, 1, 0);
            this.camera.updateMatrixWorld(true);
            return raw >= 1;
        }
        this.phaseTime += dt;
        const raw = this.phaseTime / Math.max(0.001, this.cameraMove.duration);
        const t = easeInOutSine(raw);
        const curve = this.cameraMove.curve;
        const length = this.cameraMove.length;
        const position = curve.getPointAt(clamp01(t));
        const headingWindow = THREE.MathUtils.clamp(WALK.HEADING_SAMPLE_DISTANCE / length, 0.008, 0.08);
        const headingFrom = curve.getPointAt(Math.max(0, t - headingWindow));
        const headingTo = curve.getPointAt(Math.min(1, t + headingWindow));
        const tangent = headingTo.sub(headingFrom);
        if (tangent.lengthSq() < 1e-8) {
            tangent.copy(curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, t))));
        }
        tangent.normalize();
        const envelope = Math.sin(Math.PI * clamp01(raw));
        const travelled = length * clamp01(t);
        if (travelled >= this.cameraMove.nextFootstepDistance) {
            this.audioManager?.playPubFootstep?.({
                gain: 0.42
            });
            this.cameraMove.nextFootstepDistance += this.cameraMove.footstepSpacing;
        }
        const bob = Math.sin((travelled / WALK.STRIDE_LENGTH) * Math.PI * 2) * WALK.HEAD_BOB_AMPLITUDE * envelope;
        position.y = WALK.EYE_HEIGHT + bob;
        this.camera.position.copy(position);
        const tangentLookTarget = position.clone().addScaledVector(tangent, WALK.LOOK_AHEAD);
        tangentLookTarget.y -= 0.09;
        let lookTarget = tangentLookTarget;
        if (this.cameraMove.finalLookTarget) {
            const anticipation = smoothstep01((clamp01(t) - 0.68) / 0.32);
            lookTarget = tangentLookTarget.clone().lerp(this.cameraMove.finalLookTarget, anticipation);
        }
        const desiredQuaternion = this.#lookQuaternion(position, lookTarget);
        const orientationBlend = 1 - Math.exp(-WALK.HEADING_RESPONSE * Math.max(1 / 240, dt));
        this.cameraMove.smoothedQuaternion.slerp(desiredQuaternion, orientationBlend);
        this.camera.quaternion.copy(this.cameraMove.smoothedQuaternion);
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
        if (raw >= 1) {
            this.camera.position.copy(this.cameraMove.endPosition);
            this.camera.quaternion.copy(this.cameraMove.smoothedQuaternion);
            this.camera.up.set(0, 1, 0);
            this.camera.updateMatrixWorld(true);
            return true;
        }
        return false;
    }
    #cinematicStandingPosition() {
        const current = this.camera.position.clone();
        current.y = PLAYER_VIEW.EYE_HEIGHT;
        if (!this.tableBox) {
            return current;
        }
        const inset = 0.10;
        const insideTableFootprint = current.x > this.tableBox.min.x - inset && current.x < this.tableBox.max.x + inset && current.z > this.tableBox.min.z - inset && current.z < this.tableBox.max.z + inset;
        if (!insideTableFootprint) {
            return current;
        }
        return this.playerGameplayController?.getCinematicStandingPose?.()?.position?.clone?.() ?? current;
    }
    #rackApproachPosition() {
        return new THREE.Vector3(PUB_ENVIRONMENT.ROOM_WIDTH / 2 - 0.76, PLAYER_VIEW.EYE_HEIGHT, PUB_ENVIRONMENT.CUE_RACK_Z);
    }
    #midPosition() {
        return new THREE.Vector3(0, PLAYER_VIEW.EYE_HEIGHT, (PUB_ENVIRONMENT.CUE_RACK_Z + PUB_ENVIRONMENT.SCOREBOARD_Z) * 0.5);
    }
    #scoreboardTarget() {
        return this.pubEnvironment.getScoreboardWorldCenter?.() ?? new THREE.Vector3(-PUB_ENVIRONMENT.ROOM_WIDTH / 2, 1.55, PUB_ENVIRONMENT.SCOREBOARD_Z);
    }
    #rackTarget() {
        return this.pubEnvironment.getCueRackWorldCenter?.() ?? new THREE.Vector3(PUB_ENVIRONMENT.ROOM_WIDTH / 2, 1.45, PUB_ENVIRONMENT.CUE_RACK_Z);
    }
    #entranceTarget() {
        return this.pubEnvironment.getEntranceWorldCenter?.() ?? new THREE.Vector3(0, 1.55, PUB_ENVIRONMENT.ROOM_DEPTH / 2);
    }
    #tableNavBounds() {
        if (!this.tableBox) {
            return null;
        }
        return {
            leftX: this.tableBox.min.x - WALK.TABLE_CLEARANCE,
            rightX: this.tableBox.max.x + WALK.TABLE_CLEARANCE,
            barZ: this.tableBox.min.z - WALK.TABLE_CLEARANCE,
            entranceZ: this.tableBox.max.z + WALK.TABLE_CLEARANCE
        };
    }
    #routeFromCurrentToBarRight() {
        const bounds = this.#tableNavBounds();
        if (!bounds) {
            return [
                new THREE.Vector3(1.35, WALK.EYE_HEIGHT, 1.20),
                new THREE.Vector3(1.65, WALK.EYE_HEIGHT, -0.35),
                new THREE.Vector3(1.85, WALK.EYE_HEIGHT, -0.95)
            ];
        }
        const start = this.camera.position;
        const { leftX, rightX, barZ, entranceZ } = bounds;
        const points = [];
        const add = (x, z) => {
            const point = new THREE.Vector3(x, WALK.EYE_HEIGHT, z);
            const last = points[points.length - 1];
            if (!last || last.distanceToSquared(point) > 1e-5) {
                points.push(point);
            }
        };
        if (start.z <= barZ) {
            add(Math.max(start.x, rightX), start.z);
            add(rightX, barZ);
            return points;
        }
        if (start.x >= rightX) {
            add(start.x, Math.min(start.z, entranceZ));
            add(rightX, barZ);
            return points;
        }
        if (start.z >= entranceZ) {
            add(rightX, entranceZ);
            add(rightX, barZ);
            return points;
        }
        if (start.x <= leftX) {
            add(leftX, barZ);
            add(rightX, barZ);
            return points;
        }
        const distances = [
            { side: "left", value: Math.abs(start.x - leftX) },
            { side: "right", value: Math.abs(start.x - rightX) },
            { side: "bar", value: Math.abs(start.z - barZ) },
            { side: "entrance", value: Math.abs(start.z - entranceZ) }
        ].sort((a, b) => a.value - b.value);
        const nearest = distances[0]?.side;
        if (nearest === "right") {
            add(rightX, start.z);
            add(rightX, barZ);
        }
        else if (nearest === "bar") {
            add(start.x, barZ);
            add(rightX, barZ);
        }
        else if (nearest === "entrance") {
            add(start.x, entranceZ);
            add(rightX, entranceZ);
            add(rightX, barZ);
        }
        else {
            add(leftX, start.z);
            add(leftX, barZ);
            add(rightX, barZ);
        }
        return points;
    }
    #buildRightAislePathToRack() {
        const points = this.#routeFromCurrentToBarRight();
        points.push(new THREE.Vector3(2.18, WALK.EYE_HEIGHT, -0.98), new THREE.Vector3(2.48, WALK.EYE_HEIGHT, -1.24), this.#rackApproachPosition());
        return points;
    }
    #buildRackToMidPath() {
        return [
            new THREE.Vector3(2.35, WALK.EYE_HEIGHT, -1.24),
            new THREE.Vector3(1.42, WALK.EYE_HEIGHT, -1.16),
            this.#midPosition()
        ];
    }
    #buildRightAislePathToMid() {
        const bounds = this.#tableNavBounds();
        const start = this.camera.position;
        const points = [];
        const add = (x, z) => {
            const point = new THREE.Vector3(x, WALK.EYE_HEIGHT, z);
            const last = points[points.length - 1];
            if (!last || last.distanceToSquared(point) > 1e-5) {
                points.push(point);
            }
        };
        if (!bounds) {
            add(1.10, -0.92);
            points.push(this.#midPosition());
            return points;
        }
        const { leftX, rightX, barZ, entranceZ } = bounds;
        if (start.z <= barZ) {
            add(start.x, barZ);
        }
        else if (start.x >= rightX) {
            add(rightX, Math.min(start.z, entranceZ));
            add(rightX, barZ);
        }
        else if (start.x <= leftX) {
            add(leftX, Math.min(start.z, entranceZ));
            add(leftX, barZ);
        }
        else if (start.z >= entranceZ) {
            const useRight = Math.abs(start.x - rightX) <= Math.abs(start.x - leftX);
            const sideX = useRight ? rightX : leftX;
            add(sideX, entranceZ);
            add(sideX, barZ);
        }
        else {
            const rightDistance = Math.abs(start.x - rightX);
            const leftDistance = Math.abs(start.x - leftX);
            const barDistance = Math.abs(start.z - barZ);
            if (barDistance <= Math.min(rightDistance, leftDistance)) {
                add(start.x, barZ);
            }
            else if (rightDistance <= leftDistance) {
                add(rightX, start.z);
                add(rightX, barZ);
            }
            else {
                add(leftX, start.z);
                add(leftX, barZ);
            }
        }
        const lastX = points[points.length - 1]?.x ?? start.x;
        add(THREE.MathUtils.clamp(lastX * 0.48, -0.95, 0.95), barZ - 0.04);
        points.push(this.#midPosition());
        return points;
    }

    //VICTORY
    #beginVictoryAfterHold() {
        this.phase = Phase.WIN_LIGHTS;
        this.phaseTime = 0;
    }

    //DEFEAT
    #beginDefeatAfterHold() {
        this.phase = Phase.LOSE_SALUTE;
        this.phaseTime = 0;
        this.pubEnvironment.hideGameplayHeldCue?.();
        this.cpuCueAnimator?.startEndMatchSalute?.();
    }

    //DEFEAT CUE ATTACK
    //The defeat finale temporarily hands the rack cues to the cinematic while preserving their authored rack anchors.
    #beginAttackCues() {
        const anchors = this.pubEnvironment.getRackAttackCueAnchors?.() ?? [];
        const rack = this.pubEnvironment.getCueRackGroup?.();
        this.attackCues = anchors.map((anchor, index) => {
            this.scene.attach(anchor);
            anchor.visible = true;
            anchor.updateMatrixWorld(true);
            const startPosition = anchor.position.clone();
            const startQuaternion = anchor.quaternion.clone();
            const count = Math.max(1, anchors.length);
            const centered = index - (count - 1) / 2;
            const floatPosition = new THREE.Vector3(PUB_ENVIRONMENT.ROOM_WIDTH / 2 - 1.58 - (index % 2) * 0.10, 1.30 + (index % 3) * 0.21, PUB_ENVIRONMENT.CUE_RACK_Z + centered * 0.25);
            const awayFromCamera = floatPosition.clone().sub(this.camera.position);
            if (awayFromCamera.lengthSq() < 1e-8) {
                awayFromCamera.set(1, 0, 0);
            }
            awayFromCamera.normalize();
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), awayFromCamera);
            return {
                anchor,
                rack,
                index,
                startPosition,
                startQuaternion,
                floatPosition,
                targetQuaternion,
                attackStartPosition: null,
                attackStartQuaternion: null,
                phase: Math.random() * Math.PI * 2
            };
        });
    }
    #updateCueRelease(amount) {
        const count = Math.max(1, this.attackCues.length);
        for (const cue of this.attackCues) {
            const delay = cue.index * Math.min(0.11, 0.42 / count);
            const local = clamp01((amount - delay) / Math.max(0.001, 1 - delay));
            const t = smootherstep01(local);
            cue.anchor.position.lerpVectors(cue.startPosition, cue.floatPosition, t);
            cue.anchor.quaternion.slerpQuaternions(cue.startQuaternion, cue.targetQuaternion, t);
            cue.anchor.updateMatrixWorld(true);
        }
    }
    #updateCueAim(dt, amount = 1) {
        const t = smoothstep01(amount);
        for (const cue of this.attackCues) {
            const base = cue.floatPosition;
            const wobble = Math.sin(this.phaseTime * 2.1 + cue.phase) * 0.012;
            cue.anchor.position.set(base.x, base.y + wobble, base.z);
            const awayFromCamera = cue.anchor.position.clone().sub(this.camera.position);
            if (awayFromCamera.lengthSq() > 1e-8) {
                awayFromCamera.normalize();
                const desired = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), awayFromCamera);
                cue.anchor.quaternion.slerp(desired, 0.16 + 0.50 * t);
            }
            cue.anchor.updateMatrixWorld(true);
        }
    }
    #captureAttackStarts() {
        for (const cue of this.attackCues) {
            cue.attackStartPosition = cue.anchor.position.clone();
            cue.attackStartQuaternion = cue.anchor.quaternion.clone();
        }
    }
    #updateCueAttack(amount) {
        const t = easeInCubic(amount);
        let nearest = Infinity;
        for (const cue of this.attackCues) {
            const start = cue.attackStartPosition ?? cue.anchor.position;
            const offset = new THREE.Vector3(0, (cue.index % 2 === 0 ? 1 : -1) * 0.018, (cue.index - (this.attackCues.length - 1) / 2) * 0.009);
            const target = this.camera.position.clone().add(offset);
            cue.anchor.position.lerpVectors(start, target, t);
            const awayFromCamera = cue.anchor.position.clone().sub(this.camera.position);
            if (awayFromCamera.lengthSq() > 1e-8) {
                awayFromCamera.normalize();
                cue.anchor.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), awayFromCamera));
            }
            nearest = Math.min(nearest, cue.anchor.position.distanceTo(this.camera.position));
            cue.anchor.updateMatrixWorld(true);
        }
        if (nearest < 0.34) {
            this.#showFinalOverlay(EndMatchResult.DEFEAT, true);
            return true;
        }
        return false;
    }

    //FINAL OVERLAY
    #showFinalOverlay(result = this.result, black = false) {
        this.result = result;
        this.phase = Phase.FINAL_OVERLAY;
        this.phaseTime = 0;
        this.cameraMove = null;
        this.chalkCues = [];
        this.audioManager?.stopCutsceneBed?.({
            fadeOut: 0.75
        });
        this.audioManager?.stopDefeatCueFinale?.({
            fadeOut: 0.08
        });
        this.overlay.title.textContent = result;
        const isVictory = result === EndMatchResult.VICTORY;
        this.overlay.root.style.opacity = isVictory ? "0" : "1";
        this.overlay.root.classList.remove("hidden");
        this.overlay.root.classList.toggle("defeat", black || result === EndMatchResult.DEFEAT);
        this.overlay.root.classList.toggle("victory", isVictory);
        if (isVictory) {
            requestAnimationFrame(() => {
                if (this.phase === Phase.FINAL_OVERLAY) {
                    this.overlay.root.style.opacity = "1";
                }
            });
        }
    }
    #hideOverlay() {
        this.overlay.root.classList.add("hidden");
        this.overlay.root.classList.remove("defeat", "victory");
        this.overlay.root.style.opacity = "1";
    }
    #rematch() {
        this.reset();
        this.onRematch?.();
        this.audioManager?.startJukebox?.(this.pubEnvironment.getJukeboxWorldPosition?.(), { fadeIn: 0.90 });
    }
    skip() {
        if (!this.isActive() || this.phase === Phase.FINAL_OVERLAY) {
            return;
        }
        if (this.result === EndMatchResult.VICTORY) {
            this.#applyLightMood(1, EndMatchResult.VICTORY);
            this.scoreboardSystem?.showCinematicMessage?.("Bloody Well Done", { opacity: 1, maxWidthRatio: 0.80, maxFontSize: 86 });
            this.pubEnvironment.setEntranceDoorOpenProgress?.(1);
            this.pubEnvironment.setWindowClosedProgress?.(0, 0);
            this.pubEnvironment.setWindowClosedProgress?.(1, 0);
            this.pubEnvironment.setVictoryExteriorReveal?.(1);
            if (this.pubEnvironment.beginGameplayCueReturn?.()) {
                this.pubEnvironment.setGameplayCueReturnProgress?.(1);
                this.pubEnvironment.finishGameplayCueReturn?.();
            }
            const position = this.#midPosition();
            const target = this.#entranceTarget();
            this.camera.position.copy(position);
            this.camera.quaternion.copy(this.#lookQuaternion(position, target));
            this.camera.updateMatrixWorld(true);
            this.#showFinalOverlay(EndMatchResult.VICTORY, false);
            return;
        }
        this.#applyLightMood(1, EndMatchResult.DEFEAT);
        this.scoreboardSystem?.showCinematicMessage?.("IT'S YOUR TURN NOW", { opacity: 1, maxWidthRatio: 0.72, maxFontSize: 68 });
        this.cueRig.visible = false;
        this.#showFinalOverlay(EndMatchResult.DEFEAT, true);
    }
    reset() {
        this.#hideOverlay();
        this.#restoreTableLights();
        this.scoreboardSystem?.clearCinematicMessage?.();
        this.pubEnvironment.resetCinematicCueState?.();
        this.pubEnvironment.setEntranceDoorOpenProgress?.(0);
        this.pubEnvironment.setWindowClosedProgress?.(0, 1);
        this.pubEnvironment.setWindowClosedProgress?.(1, 1);
        this.pubEnvironment.resetVictoryExteriorReveal?.();
        this.playerGameplayController?.setCinematicLock?.(false);
        this.cpuCueAnimator?.cancel?.();
        this.cueRig.visible = false;
        this.audioManager?.stopCutsceneBed?.({
            fadeOut: 0
        });
        this.audioManager?.stopDefeatCueFinale?.({
            fadeOut: 0
        });
        if (this.debugStatusElement && this.debugStatusWasVisible) {
            this.debugStatusElement.style.display = "block";
        }
        this.debugStatusWasVisible = false;
        this.phase = Phase.IDLE;
        this.phaseTime = 0;
        this.result = null;
        this.reason = null;
        this.cameraMove = null;
        this.attackCues = [];
        this.chalkCues = [];
    }

    //TIMELINE
    update(dt) {
        if (!this.isActive() || this.phase === Phase.FINAL_OVERLAY) {
            return;
        }
        if (this.phase === Phase.FINAL_SHOT_HOLD) {
            this.phaseTime += dt;
            if (this.phaseTime >= DURATIONS.FINAL_SHOT_HOLD) {
                if (this.result === EndMatchResult.VICTORY) {
                    this.#beginVictoryAfterHold();
                }
                else {
                    this.#beginDefeatAfterHold();
                }
            }
            return;
        }
        if (this.phase === Phase.WIN_LIGHTS) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / DURATIONS.WIN_LIGHTS);
            this.#applyLightMood(t, EndMatchResult.VICTORY);
            if (t >= 1) {
                const endPosition = this.#cinematicStandingPosition();
                const endTarget = this.tableCenter.clone().setY(1.05);
                this.cueRig.visible = false;
                this.#startCameraMove(Phase.WIN_RISE, endPosition, endTarget, DURATIONS.WIN_RISE);
            }
            return;
        }
        if (this.phase === Phase.WIN_RISE) {
            if (this.#updateCameraMove(dt)) {
                this.pubEnvironment.showGameplayHeldCue?.(this.camera);
                this.#startWalkMove(Phase.WIN_WALK_RACK, this.#buildRightAislePathToRack(), { speed: 0.78, finalLookTarget: this.#rackTarget() });
            }
            return;
        }
        if (this.phase === Phase.WIN_WALK_RACK) {
            if (this.#updateCameraMove(dt)) {
                this.phase = Phase.WIN_STORE_CUE;
                this.phaseTime = 0;
                this.cameraMove = null;
                this.pubEnvironment.beginGameplayCueReturn?.();
            }
            return;
        }
        if (this.phase === Phase.WIN_STORE_CUE) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / DURATIONS.WIN_STORE_CUE);
            this.pubEnvironment.setGameplayCueReturnProgress?.(t);
            if (t >= 1) {
                this.pubEnvironment.finishGameplayCueReturn?.();
                this.#playAt("cueRackTouch", this.pubEnvironment.getCueRackWorldCenter?.(), { gain: 0.48 });
                this.#startCameraMove(Phase.WIN_TURN_BOARD, this.camera.position.clone(), this.#scoreboardTarget(), DURATIONS.WIN_TURN_BOARD);
            }
            return;
        }
        if (this.phase === Phase.WIN_TURN_BOARD) {
            if (this.#updateCameraMove(dt)) {
                this.phase = Phase.WIN_BOARD_MESSAGE;
                this.phaseTime = 0;
                this.cameraMove = null;
                this.scoreboardSystem?.showCinematicMessage?.("Bloody Well Done", {
                    opacity: 1,
                    reveal: 0,
                    maxWidthRatio: 0.80,
                    maxFontSize: 86
                });
                this.#beginChalkCues([
                    {
                        time: 0,
                        sound: "chalkLong"
                    },
                    {
                        time: this.chalkLongDuration,
                        sound: "chalkMedium"
                    }
                ]);
            }
            return;
        }
        if (this.phase === Phase.WIN_BOARD_MESSAGE) {
            this.phaseTime += dt;
            this.#updateChalkCues(this.phaseTime);
            this.scoreboardSystem?.setCinematicMessageReveal?.(clamp01(this.phaseTime / Math.max(0.001, this.winBoardDuration)));
            if (this.phaseTime >= this.winBoardDuration) {
                this.#startWalkMove(Phase.WIN_MOVE_CENTER, this.#buildRackToMidPath(), { speed: 0.76, finalLookTarget: this.#scoreboardTarget() });
            }
            return;
        }
        if (this.phase === Phase.WIN_MOVE_CENTER) {
            if (this.#updateCameraMove(dt)) {
                this.#startCameraMove(Phase.WIN_TURN_EXIT, this.camera.position.clone(), this.#entranceTarget(), DURATIONS.WIN_TURN_EXIT);
            }
            return;
        }
        if (this.phase === Phase.WIN_TURN_EXIT) {
            if (this.#updateCameraMove(dt)) {
                this.phase = Phase.WIN_OPEN_PUB;
                this.phaseTime = 0;
                this.cameraMove = null;
                this.#beginVictoryOpenAudio();
            }
            return;
        }
        if (this.phase === Phase.WIN_OPEN_PUB) {
            this.phaseTime += dt;
            const doorT = smoothstep01(this.phaseTime / Math.max(0.001, this.doorOpenDuration));
            const windowT = smoothstep01(this.phaseTime / Math.max(0.001, this.windowOpenDuration));
            const overallT = smoothstep01(this.phaseTime / Math.max(0.001, this.winOpenPubDuration));
            this.pubEnvironment.setEntranceDoorOpenProgress?.(doorT);
            this.pubEnvironment.setWindowClosedProgress?.(0, 1 - windowT);
            this.pubEnvironment.setWindowClosedProgress?.(1, 1 - windowT);
            this.pubEnvironment.setVictoryExteriorReveal?.(overallT);
            if (overallT >= 1) {
                this.#showFinalOverlay(EndMatchResult.VICTORY, false);
            }
            return;
        }
        if (this.phase === Phase.LOSE_SALUTE) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / Math.max(0.001, this.loseSaluteDuration));
            this.#applyLightMood(t, EndMatchResult.DEFEAT);
            if (t >= 1) {
                this.#startWalkMove(Phase.LOSE_MOVE_CENTER, this.#buildRightAislePathToMid(), { speed: 0.77, finalLookTarget: this.#scoreboardTarget() });
            }
            return;
        }
        if (this.phase === Phase.LOSE_MOVE_CENTER) {
            if (this.#updateCameraMove(dt)) {
                this.#startCameraMove(Phase.LOSE_TURN_BOARD, this.camera.position.clone(), this.#scoreboardTarget(), DURATIONS.LOSE_TURN_BOARD);
            }
            return;
        }
        if (this.phase === Phase.LOSE_TURN_BOARD) {
            if (this.#updateCameraMove(dt)) {
                this.phase = Phase.LOSE_SCOREBOARD;
                this.phaseTime = 0;
                this.cameraMove = null;
                this.scoreboardSystem?.showCinematicMessage?.("IT'S YOUR TURN NOW", {
                    opacity: 1,
                    reveal: 0,
                    maxWidthRatio: 0.72,
                    maxFontSize: 68
                });
                this.#beginChalkCues([
                    {
                        time: 0,
                        sound: "chalkLong"
                    },
                    {
                        time: this.chalkLongDuration,
                        sound: "chalkLong"
                    }
                ]);
            }
            return;
        }
        if (this.phase === Phase.LOSE_SCOREBOARD) {
            this.phaseTime += dt;
            this.#updateChalkCues(this.phaseTime);
            this.scoreboardSystem?.setCinematicMessageReveal?.(clamp01(this.phaseTime / Math.max(0.001, this.loseBoardDuration)));
            if (this.phaseTime >= this.loseBoardDuration) {
                this.#startCameraMove(Phase.LOSE_TURN_RACK, this.camera.position.clone(), this.#rackTarget(), DURATIONS.LOSE_TURN_RACK);
            }
            return;
        }
        if (this.phase === Phase.LOSE_TURN_RACK) {
            if (this.#updateCameraMove(dt)) {
                this.phase = Phase.LOSE_CUES_RELEASE;
                this.phaseTime = 0;
                this.cameraMove = null;
                this.audioManager?.stopCutsceneBed?.({ fadeOut: 0.18 });
                this.audioManager?.startDefeatCueFinale?.({ fadeIn: 0.08 });
                this.#beginAttackCues();
            }
            return;
        }
        if (this.phase === Phase.LOSE_CUES_RELEASE) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / DURATIONS.LOSE_CUES_RELEASE);
            this.#updateCueRelease(t);
            if (t >= 1) {
                this.phase = Phase.LOSE_CUES_AIM;
                this.phaseTime = 0;
            }
            return;
        }
        if (this.phase === Phase.LOSE_CUES_AIM) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / DURATIONS.LOSE_CUES_AIM);
            this.#updateCueAim(dt, t);
            if (t >= 1) {
                this.phase = Phase.LOSE_SUSPENSE;
                this.phaseTime = 0;
            }
            return;
        }
        if (this.phase === Phase.LOSE_SUSPENSE) {
            this.phaseTime += dt;
            this.#updateCueAim(dt, 1);
            if (this.phaseTime >= DURATIONS.LOSE_SUSPENSE) {
                this.phase = Phase.LOSE_ATTACK;
                this.phaseTime = 0;
                this.#captureAttackStarts();
            }
            return;
        }
        if (this.phase === Phase.LOSE_ATTACK) {
            this.phaseTime += dt;
            const t = clamp01(this.phaseTime / DURATIONS.LOSE_ATTACK);
            if (this.#updateCueAttack(t)) {
                return;
            }
            if (t >= 1) {
                this.#showFinalOverlay(EndMatchResult.DEFEAT, true);
            }
        }
    }
    dispose() {
        window.removeEventListener("keydown", this._onKeyDown, true);
        this.reset();
        this.overlay.root.remove();
    }
}
