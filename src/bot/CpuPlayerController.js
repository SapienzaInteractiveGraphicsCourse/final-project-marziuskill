//Coordinates KILL turn state, camera preparation, cue animation and shot execution.

//DEPENDENCIES
import * as THREE from "three";
import { CPU_PLAYER, SHOT } from "../config/constants.js";
import { MatchPhase } from "../game/MatchController.js";
import { BallInHandMode } from "../game/BallInHandSystem.js";
import { BallState } from "../physics/RigidBall.js";

//TURN STATE
export const CpuTurnState = Object.freeze({
    HUMAN_TURN: "HUMAN_TURN",
    WAITING: "WAITING",
    PLANNING: "PLANNING",
    AIMED: "AIMED",
    SHOOTING: "SHOOTING",
    ERROR: "ERROR",
    GAME_OVER: "GAME_OVER"
});
const _center = new THREE.Vector3();
const _candidate = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();

//HELPERS
function parseBallNumber(label) {
    if (typeof label !== "string") {
        return null;
    }
    const match = /^Ball\s+(\d+)$/.exec(label.trim());
    if (!match) {
        return null;
    }
    const number = Number(match[1]);
    return Number.isInteger(number) ? number : null;
}
function isInPlay(body) {
    if (body.pocketCommitted) {
        return false;
    }
    return ![
        BallState.FALLEN,
        BallState.COLLECTED,
        BallState.RETURNING,
        BallState.POCKET_CAPTURED
    ].includes(body.state);
}
function yawDegForDirection(direction) {
    return THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
}
function clampPower(value) {
    return THREE.MathUtils.clamp(value, SHOT.MIN_POWER, SHOT.MAX_POWER);
}

//CPU CONTROLLER
export class CpuPlayerController {

    //INITIALIZATION
    constructor({ matchController, botPlanner, ballInHandSystem, shotSystem, cueRig, clearanceSystem, trajectoryPreviewSystem, cueBallBody, objectBallBodies, pocketSystem, playingSurfaceBox, cueBallStartPosition, shotExecutor = null, isShotExecutorBusy = null, playerGameplayController = null, cpuPlayerIndex = CPU_PLAYER.PLAYER_INDEX }) {
        this.matchController = matchController;
        this.botPlanner = botPlanner;
        this.ballInHandSystem = ballInHandSystem;
        this.shotSystem = shotSystem;
        this.cueRig = cueRig;
        this.clearanceSystem = clearanceSystem;
        this.trajectoryPreviewSystem = trajectoryPreviewSystem;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.pocketSystem = pocketSystem;
        this.playingSurfaceBox = playingSurfaceBox.clone();
        this.cueBallStartPosition = cueBallStartPosition.clone();
        this.cpuPlayerIndex = cpuPlayerIndex;
        this.playerGameplayController = playerGameplayController;
        this.shotExecutor = shotExecutor;
        this.isShotExecutorBusy = isShotExecutorBusy;
        this.shotSetupListener = null;
        this.lastSelectedShotSetup = null;
        this.generation = 0;
        this.paused = false;
        this.reset();
    }
    setShotExecutor(shotExecutor, isBusy = null) {
        this.shotExecutor = shotExecutor;
        this.isShotExecutorBusy = isBusy;
    }
    setPlayerGameplayController(controller) {
        this.playerGameplayController = controller;
    }
    setPaused(active) {
        const next = Boolean(active);
        if (this.paused === next) {
            return;
        }
        this.paused = next;
        if (next && this.state === CpuTurnState.PLANNING) {
            this.generation += 1;
            this.botPlanner.cancel?.();
            this.state = CpuTurnState.WAITING;
            this.timer = 0;
            this.thinkingViewPrepared = true;
            this.message = "KILL's planning is paused.";
        }
    }
    setShotSetupListener(listener = null) {
        this.shotSetupListener = typeof listener === "function" ? listener : null;
    }
    getLastSelectedShotSetup() {
        if (!this.lastSelectedShotSetup) {
            return null;
        }
        const setup = this.lastSelectedShotSetup;
        return {
            ...setup,
            cueBallPosition: setup.cueBallPosition.clone(),
            shotDirection: setup.shotDirection.clone()
        };
    }
    reset() {
        this.generation += 1;
        this.state = CpuTurnState.HUMAN_TURN;
        this.timer = 0;
        this.message = "Waiting for the human player.";
        this.lastError = null;
        this.fallbackUsed = false;
        this.preShotClearanceDone = false;
        this.thinkingViewPrepared = false;
    }
    isCpuTurn() {
        const rules = this.matchController.getRuleState();
        return (!rules.gameOverReason && rules.currentPlayer === this.cpuPlayerIndex);
    }
    isHumanTurn() {
        return !this.isCpuTurn();
    }
    isBusy() {
        return [
            CpuTurnState.WAITING,
            CpuTurnState.PLANNING,
            CpuTurnState.AIMED,
            CpuTurnState.SHOOTING
        ].includes(this.state);
    }
    getState() {
        return {
            state: this.state,
            message: this.message,
            cpuTurn: this.isCpuTurn(),
            fallbackUsed: this.fallbackUsed,
            error: this.lastError
        };
    }
    handleBallInHand(mode) {
        if (!this.isCpuTurn()) {
            return false;
        }
        this.botPlanner.cancel();
        this.state = CpuTurnState.WAITING;
        this.message = "CPU is placing the cue ball.";
        this.matchController.beginBallInHand();
        const placement = this.ballInHandSystem.placeAutomatically({
            mode,
            preferredPositions: this.#buildPlacementCandidates(mode)
        });
        if (!placement.success) {
            this.#fail("CPU could not find a legal ball-in-hand position.");
            return false;
        }
        if (!this.matchController.completeBallInHand()) {
            this.#fail("CPU ball-in-hand placement could not be committed to the match.");
            return false;
        }
        this.shotSystem.rearmForNextShot();
        this.cueRig.visible = false;
        this.cueRig.position.copy(this.cueBallBody.position);
        this.clearanceSystem.update(true);
        this.trajectoryPreviewSystem.invalidate();
        this.timer = CPU_PLAYER.THINK_DELAY;
        this.thinkingViewPrepared = false;
        this.message = mode === BallInHandMode.KITCHEN ? "CPU placed the cue ball in the kitchen." : "CPU placed the cue ball.";
        return true;
    }

    //UPDATE LOOP
    update(dt) {
        if (this.paused) {
            return;
        }
        const rules = this.matchController.getRuleState();
        if (rules.gameOverReason) {
            this.state = CpuTurnState.GAME_OVER;
            this.message = "Game over.";
            return;
        }
        if (!this.isCpuTurn()) {
            if (this.state !== CpuTurnState.HUMAN_TURN) {
                this.generation += 1;
                this.state = CpuTurnState.HUMAN_TURN;
                this.timer = 0;
                this.message = "Your turn.";
                this.fallbackUsed = false;
                this.preShotClearanceDone = false;
                this.thinkingViewPrepared = false;
            }
            return;
        }
        if (this.matchController.phase === MatchPhase.SCRATCH_PENDING) {
            const pending = this.matchController.getPendingPlacementMode();
            if (pending) {
                this.handleBallInHand(pending === "KITCHEN" ? BallInHandMode.KITCHEN : BallInHandMode.ANYWHERE);
            }
            return;
        }
        if (this.matchController.phase !== MatchPhase.AIMING) {
            return;
        }
        if (this.state === CpuTurnState.SHOOTING && this.isShotExecutorBusy?.()) {
            return;
        }
        if (this.shotSystem.strokeStarted || this.shotSystem.hasCommittedShot() || this.cueRig.strokeActive) {
            return;
        }
        if (this.state === CpuTurnState.SHOOTING) {
            this.state = CpuTurnState.WAITING;
            this.preShotClearanceDone = false;
            this.thinkingViewPrepared = false;
            this.timer = CPU_PLAYER.NEXT_SHOT_DELAY;
            this.message = "CPU continues its turn.";
            return;
        }
        if (this.state === CpuTurnState.HUMAN_TURN) {
            this.state = CpuTurnState.WAITING;
            this.preShotClearanceDone = false;
            this.thinkingViewPrepared = false;
            this.timer = CPU_PLAYER.THINK_DELAY;
            this.message = "CPU is thinking.";
            return;
        }
        if (this.state === CpuTurnState.WAITING) {
            this.timer -= dt;
            if (this.timer <= 0) {
                if (!this.thinkingViewPrepared) {
                    const viewResult = this.playerGameplayController?.prepareSpectatorForCpuThinking?.();
                    if (viewResult === null) {
                        this.timer = 0.06;
                        return;
                    }
                    this.thinkingViewPrepared = true;
                    if (viewResult === true) {
                        this.message = "KILL is waiting for the spectator view.";
                        this.timer = 0.50;
                        return;
                    }
                }
                if (this.playerGameplayController?.getPhase?.() !== "FREE") {
                    this.timer = 0.06;
                    return;
                }
                this.#startPlanning();
            }
            return;
        }
        if (this.state === CpuTurnState.AIMED) {
            this.timer -= dt;
            if (this.timer > 0) {
                return;
            }
            if (!this.preShotClearanceDone) {
                const clearanceResult = this.playerGameplayController?.prepareAutoClearForCpuShot?.({
                    cueBallPosition: this.cueBallBody.position,
                    shotDirection: this.cueRig.getShotDirectionWorld(new THREE.Vector3()),
                    sidePreference: "right"
                });
                if (clearanceResult === null) {
                    this.timer = 0.10;
                    return;
                }
                this.preShotClearanceDone = true;
                if (clearanceResult === true) {
                    this.timer = 0.90;
                    this.message = "KILL waits for the player to clear the shooting lane.";
                    return;
                }
            }
            if (!this.matchController.canStartShot() || !this.shotSystem.canShoot()) {
                return;
            }
            const started = this.shotExecutor ? this.shotExecutor() : this.shotSystem.requestShot();
            if (started) {
                this.state = CpuTurnState.SHOOTING;
                this.message = "KILL is preparing the shot.";
            }
            return;
        }
    }
    #captureSelectedShotSetup(source) {
        this.cueRig.updateWorldMatrix(true, true);
        const hit = this.shotSystem.getHitOffset();
        const setup = {
            source,
            cueBallPosition: this.cueBallBody.position.clone(),
            yawDeg: this.cueRig.getYawDeg(),
            elevationDeg: this.cueRig.getElevationDeg(),
            hitU: hit.u,
            hitV: hit.v,
            power: this.shotSystem.getPower(),
            shotDirection: this.cueRig.getShotDirectionWorld(new THREE.Vector3()).clone(),
            minimumElevationDeg: this.cueRig.getMinimumElevationDeg(),
            timestamp: performance.now()
        };
        this.lastSelectedShotSetup = setup;
        console.groupCollapsed(`[KILL-SHOT] selected setup · ${source}`);
        console.table({
            cueX: setup.cueBallPosition.x,
            cueY: setup.cueBallPosition.y,
            cueZ: setup.cueBallPosition.z,
            yawDeg: setup.yawDeg,
            elevationDeg: setup.elevationDeg,
            minimumElevationDeg: setup.minimumElevationDeg,
            hitU: setup.hitU,
            hitV: setup.hitV,
            power: setup.power,
            dirX: setup.shotDirection.x,
            dirY: setup.shotDirection.y,
            dirZ: setup.shotDirection.z
        });
        console.log("KILL shot setup object", setup);
        console.groupEnd();
        this.shotSetupListener?.(this.getLastSelectedShotSetup());
        return setup;
    }
    #startPlanning() {
        if (!this.isCpuTurn() || this.matchController.phase !== MatchPhase.AIMING) {
            return;
        }
        const generation = ++this.generation;
        this.state = CpuTurnState.PLANNING;
        this.message = "CPU is evaluating shots.";
        this.fallbackUsed = false;
        this.preShotClearanceDone = false;
        Promise.resolve(this.botPlanner.plan()).then(best => {
            if (generation !== this.generation || !this.isCpuTurn() || this.matchController.phase !== MatchPhase.AIMING) {
                return;
            }
            if (best && this.botPlanner.applyBestPlan()) {
                this.preShotClearanceDone = false;
                this.#captureSelectedShotSetup("planner");
                this.state = CpuTurnState.AIMED;
                this.timer = CPU_PLAYER.AIM_REVIEW_DELAY;
                this.message = "CPU selected a simulated shot.";
                return;
            }
            this.#applyFallbackShot();
        }).catch(error => {
            console.error("CPU planning failed:", error);
            if (generation !== this.generation) {
                return;
            }
            this.#applyFallbackShot();
        });
    }
    #applyFallbackShot() {
        const rules = this.matchController.getRuleState();
        const targets = this.#getLegalTargetBodies(rules);
        if (targets.length === 0) {
            this.#fail("CPU has no legal fallback target.");
            return false;
        }
        targets.sort((a, b) => this.cueBallBody.position.distanceToSquared(a.position) - this.cueBallBody.position.distanceToSquared(b.position));
        const target = targets[0];
        _targetDirection.subVectors(target.position, this.cueBallBody.position);
        _targetDirection.y = 0;
        if (_targetDirection.lengthSq() < 1e-12) {
            this.#fail("CPU fallback direction is degenerate.");
            return false;
        }
        _targetDirection.normalize();
        this.cueRig.setYawDeg(yawDegForDirection(_targetDirection));
        this.shotSystem.setHitOffset(0, 0);
        this.clearanceSystem.update(true);
        this.cueRig.setElevationDeg(this.cueRig.getMinimumElevationDeg());
        const distance = this.cueBallBody.position.distanceTo(target.position);
        const power = THREE.MathUtils.clamp(0.30 + distance * 0.28, CPU_PLAYER.FALLBACK_MIN_POWER, CPU_PLAYER.FALLBACK_MAX_POWER);
        this.shotSystem.setPower(clampPower(power));
        if (rules.currentPlayerOnEight) {
            const pockets = this.pocketSystem.getPockets();
            if (pockets.length > 0) {
                const pocket = [...pockets].sort((a, b) => target.position.distanceToSquared(a.center) - target.position.distanceToSquared(b.center))[0];
                this.matchController.callEightPocket(pocket.name);
            }
        }
        this.trajectoryPreviewSystem.invalidate();
        this.preShotClearanceDone = false;
        this.#captureSelectedShotSetup("fallback");
        this.state = CpuTurnState.AIMED;
        this.timer = CPU_PLAYER.AIM_REVIEW_DELAY;
        this.message = "CPU planner had no viable pot; using a legal direct-contact fallback.";
        this.fallbackUsed = true;
        return true;
    }
    #getLegalTargetNumbers(rules) {
        const player = rules.players[rules.currentPlayer];
        if (rules.currentPlayerOnEight) {
            return [8];
        }
        if (!player?.group) {
            return [
                1, 2, 3, 4, 5, 6, 7,
                9, 10, 11, 12, 13, 14, 15
            ];
        }
        return [
            ...(player.remaining ?? [])
        ];
    }
    #getLegalTargetBodies(rules) {
        const legal = new Set(this.#getLegalTargetNumbers(rules));
        return this.objectBallBodies.filter(body => isInPlay(body) && legal.has(parseBallNumber(body.label)));
    }
    #buildPlacementCandidates(mode) {
        const candidates = [];
        this.playingSurfaceBox.getCenter(_center);
        _center.y = this.cueBallBody.position.y;
        const rules = this.matchController.getRuleState();
        const targets = this.#getLegalTargetBodies(rules);
        const tacticalCandidates = [];
        for (const target of targets) {
            _direction.subVectors(_center, target.position);
            _direction.y = 0;
            if (_direction.lengthSq() < 1e-12) {
                _direction.set(1, 0, 0);
            }
            else {
                _direction.normalize();
            }
            _candidate.copy(target.position).addScaledVector(_direction, 0.34);
            _candidate.y = this.cueBallBody.position.y;
            tacticalCandidates.push(_candidate.clone());
        }
        if (mode === BallInHandMode.KITCHEN) {
            candidates.push(this.cueBallStartPosition.clone());
            candidates.push(...tacticalCandidates);
        }
        else {
            candidates.push(...tacticalCandidates);
            candidates.push(_center.clone());
        }
        for (const fx of CPU_PLAYER.PLACEMENT_GRID_FRACTIONS) {
            for (const fz of CPU_PLAYER.PLACEMENT_GRID_FRACTIONS) {
                candidates.push(new THREE.Vector3(THREE.MathUtils.lerp(this.playingSurfaceBox.min.x, this.playingSurfaceBox.max.x, fx), this.cueBallBody.position.y, THREE.MathUtils.lerp(this.playingSurfaceBox.min.z, this.playingSurfaceBox.max.z, fz)));
            }
        }
        if (mode === BallInHandMode.ANYWHERE) {
            candidates.push(this.cueBallStartPosition.clone());
        }
        return candidates;
    }
    #fail(message) {
        this.state = CpuTurnState.ERROR;
        this.message = message;
        this.lastError = message;
        console.error(message);
    }
}
