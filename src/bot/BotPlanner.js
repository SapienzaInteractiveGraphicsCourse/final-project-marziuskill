//Builds and scores deterministic candidate shots before KILL commits to one.

//DEPENDENCIES
import * as THREE from "three";
import { BOT_PLANNER, SHOT } from "../config/constants.js";
import { BotDifficulty, getBotDifficultyProfile, getBotDifficultyOptions, chooseDifficultyResult, buildDifficultyExecution } from "./BotDifficulty.js";
import { BallState } from "../physics/RigidBall.js";
import { EightBallTableState, PlayerGroup } from "../game/RuleSet8Ball.js";

//SCRATCH VECTORS
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _toPocket = new THREE.Vector3();
const _ghost = new THREE.Vector3();
const _cueToGhost = new THREE.Vector3();
const _incoming = new THREE.Vector3();
const _objectDirection = new THREE.Vector3();
const _rackCenter = new THREE.Vector3();

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
function groupForBall(number) {
    if (number >= 1 && number <= 7) {
        return PlayerGroup.SOLIDS;
    }
    if (number >= 9 && number <= 15) {
        return PlayerGroup.STRIPES;
    }
    return null;
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
function pointSegmentDistanceSq(point, a, b) {
    _ab.subVectors(b, a);
    _ap.subVectors(point, a);
    const denom = _ab.lengthSq();
    if (denom <= 1e-12) {
        return point.distanceToSquared(a);
    }
    const t = THREE.MathUtils.clamp(_ap.dot(_ab) / denom, 0, 1);
    _closest.copy(a).addScaledVector(_ab, t);
    return point.distanceToSquared(_closest);
}
function segmentBlocked({ a, b, bodies, skip = [], minimumDistance }) {
    const minSq = minimumDistance * minimumDistance;
    for (const body of bodies) {
        if (skip.includes(body) || !isInPlay(body)) {
            continue;
        }
        if (pointSegmentDistanceSq(body.position, a, b) < minSq) {
            return true;
        }
    }
    return false;
}
function clampPower(power) {
    return THREE.MathUtils.clamp(power, SHOT.MIN_POWER, SHOT.MAX_POWER);
}
function summarizePocketedNumbers(summary) {
    return (summary.pocketedEvents ?? []).map(event => ({
        number: parseBallNumber(event.ball),
        pocket: event.pocket
    })).filter(entry => Number.isInteger(entry.number));
}

//SHOT PLANNER
export class BotPlanner {

    //STATE
    constructor({ cueRig, shotSystem, clearanceSystem, trajectoryPreviewSystem, cueBallBody, objectBallBodies, pocketSystem, playingSurfaceBox, matchController, ballInHandSystem, simulator }) {
        this.cueRig = cueRig;
        this.shotSystem = shotSystem;
        this.clearanceSystem = clearanceSystem;
        this.trajectoryPreviewSystem = trajectoryPreviewSystem;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.pocketSystem = pocketSystem;
        this.playingSurfaceBox = playingSurfaceBox.clone();
        this.matchController = matchController;
        this.ballInHandSystem = ballInHandSystem;
        this.simulator = simulator;
        this.difficulty = BotDifficulty.MEDIUM;
        this.planGeneration = 0;
        this.state = {
            status: "IDLE",
            message: "Ready to search.",
            tested: 0,
            total: 0,
            best: null,
            top: [],
            tableSignature: null,
            error: null,
            difficulty: this.difficulty,
            difficultyLabel: getBotDifficultyProfile(this.difficulty).label,
            selectedRank: null,
            execution: null
        };
    }
    getDifficulty() {
        return this.difficulty;
    }
    getDifficultyOptions() {
        return getBotDifficultyOptions();
    }
    setDifficulty(difficulty) {
        const profile = getBotDifficultyProfile(difficulty);
        if (profile.id === this.difficulty) {
            return true;
        }
        this.cancel();
        this.difficulty = profile.id;
        this.state = {
            status: "IDLE",
            message: `${profile.label} difficulty selected. Plan again.`,
            tested: 0,
            total: 0,
            best: null,
            top: [],
            tableSignature: null,
            error: null,
            difficulty: this.difficulty,
            difficultyLabel: profile.label,
            selectedRank: null,
            execution: null
        };
        return true;
    }
    isPlanning() {
        return (this.state.status === "PLANNING");
    }
    canPlan() {
        return (!this.isPlanning() && !this.ballInHandSystem.isActive() && !this.shotSystem.strokeStarted && !this.shotSystem.hasCommittedShot() && this.shotSystem.canShoot() && this.matchController.phase === "AIMING" && !this.matchController.getRuleState().gameOverReason);
    }
    getState() {
        return {
            status: this.state.status,
            message: this.state.message,
            tested: this.state.tested,
            total: this.state.total,
            best: this.state.best ? {
                ...this.state.best,
                candidate: {
                    ...this.state.best.candidate
                },
                pocketed: [
                    ...this.state.best.pocketed
                ]
            } : null,
            top: this.state.top.map(entry => ({
                ...entry,
                candidate: {
                    ...entry.candidate
                },
                pocketed: [...entry.pocketed]
            })),
            error: this.state.error,
            difficulty: this.difficulty,
            difficultyLabel: getBotDifficultyProfile(this.difficulty).label,
            selectedRank: this.state.selectedRank,
            execution: this.state.execution ? {
                candidate: {
                    ...this.state.execution.candidate
                },
                error: {
                    ...this.state.execution.error
                }
            } : null
        };
    }
    cancel() {
        this.planGeneration += 1;
        if (this.isPlanning()) {
            this.state = {
                ...this.state,
                status: "CANCELLED",
                message: "Planner cancelled."
            };
        }
    }

    //PLANNING
    async plan() {
        if (!this.canPlan()) {
            return null;
        }
        const generation = ++this.planGeneration;
        const difficulty = this.difficulty;
        const profile = getBotDifficultyProfile(difficulty);
        const ruleState = this.matchController.getRuleState();
        const tableSignature = this.#makeTableSignature(ruleState);
        const candidates = this.#generateCandidates(ruleState, profile);
        this.state = {
            status: "PLANNING",
            message: candidates.length > 0 ? `Evaluating ${candidates.length} physics candidates…` : "No viable candidate routes.",
            tested: 0,
            total: candidates.length,
            best: null,
            top: [],
            tableSignature,
            error: null,
            difficulty,
            difficultyLabel: profile.label,
            selectedRank: null,
            execution: null
        };
        if (candidates.length === 0) {
            this.state.status = "NO_PLAN";
            return null;
        }
        const results = [];
        try {
            for (let i = 0; i < candidates.length; i += 1) {
                if (generation !== this.planGeneration) {
                    return null;
                }
                const candidate = candidates[i];
                const minimumElevation = this.clearanceSystem.getMinimumElevationForYaw(candidate.yawDeg);
                if (minimumElevation === null) {
                    this.state.tested = i + 1;
                    continue;
                }
                const evaluatedCandidate = {
                    ...candidate,
                    elevationDeg: Math.max(candidate.elevationDeg ?? 0, minimumElevation)
                };
                const simulation = this.simulator.simulate({
                    cueBallBody: this.cueBallBody,
                    objectBallBodies: this.objectBallBodies,
                    candidate: evaluatedCandidate
                });
                const scored = this.#scoreSimulation({
                    candidate: evaluatedCandidate,
                    simulation,
                    ruleState
                });
                results.push(scored);
                results.sort((a, b) => b.score - a.score);
                if (results.length > profile.topResultsToKeep) {
                    results.length = profile.topResultsToKeep;
                }
                this.state.tested = i + 1;
                this.state.top = results.map(entry => ({
                    ...entry
                }));
                this.state.best = results[0] ?? null;
                this.state.message = `Evaluated ${i + 1}/${candidates.length}.`;
                if ((i + 1) % BOT_PLANNER.YIELD_EVERY_CANDIDATES === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            if (generation !== this.planGeneration) {
                return null;
            }
            const choice = chooseDifficultyResult({
                results,
                tableSignature,
                difficulty
            });
            const best = choice.result;
            const execution = best ? buildDifficultyExecution({
                candidate: best.candidate,
                tableSignature,
                difficulty,
                minPower: SHOT.MIN_POWER,
                maxPower: SHOT.MAX_POWER
            }) : null;
            this.state.status = best ? "READY" : "NO_PLAN";
            this.state.best = best;
            this.state.top = results;
            this.state.selectedRank = choice.rank;
            this.state.execution = execution;
            this.state.message = best ? (choice.rank > 1 ? `${profile.label}: selected candidate #${choice.rank} (${best.score.toFixed(1)}). Apply to inspect the executed shot.` : `${profile.label}: selected best score ${best.score.toFixed(1)}. Apply to inspect the executed shot.`) : "No candidate survived cue-clearance checks.";
            return best;
        }
        catch (error) {
            console.error("Bot planner failed:", error);
            this.state.status = "ERROR";
            this.state.error = error instanceof Error ? error.message : String(error);
            this.state.message = this.state.error;
            return null;
        }
    }

    //RESULT APPLICATION
    applyBestPlan() {
        const best = this.state.best;
        if (!best) {
            return false;
        }
        const ruleState = this.matchController.getRuleState();
        if (this.state.tableSignature !== this.#makeTableSignature(ruleState)) {
            this.state.status = "STALE";
            this.state.message = "Table/rules changed. Plan again.";
            return false;
        }
        if (!this.canPlan()) {
            return false;
        }
        const candidate = this.state.execution?.candidate ?? best.candidate;
        this.cueRig.setYawDeg(candidate.yawDeg);
        this.shotSystem.setHitOffset(candidate.hitU, candidate.hitV);
        this.clearanceSystem.update(true);
        this.cueRig.setElevationDeg(candidate.elevationDeg);
        this.shotSystem.setPower(candidate.power);
        if (ruleState.currentPlayerOnEight && candidate.pocketName) {
            this.matchController.callEightPocket(candidate.pocketName);
        }
        this.trajectoryPreviewSystem.invalidate();
        this.state.status = "APPLIED";
        const executionError = this.state.execution?.error;
        const errorText = executionError ? (` Δyaw=${executionError.yawDeg >= 0 ? "+" : ""}${executionError.yawDeg.toFixed(2)}°, ` + `Δpower=${executionError.powerRelative >= 0 ? "+" : ""}${(executionError.powerRelative * 100).toFixed(1)}%.`) : "";
        this.state.message = `${getBotDifficultyProfile(this.difficulty).label} plan applied.${errorText} Review the real preview, then shoot manually.`;
        return true;
    }

    //CANDIDATE GENERATION
    #generateCandidates(ruleState, profile) {
        if (ruleState.tableState === EightBallTableState.BREAK) {
            return this.#generateBreakCandidates(profile);
        }
        const activeObjects = this.objectBallBodies.filter(isInPlay);
        const targetNumbers = this.#legalTargetNumbers(ruleState);
        const targetSet = new Set(targetNumbers);
        const targetBodies = activeObjects.filter(body => targetSet.has(parseBallNumber(body.label)));
        if (targetBodies.length === 0) {
            return [];
        }
        const calledEightPocket = ruleState.currentPlayerOnEight ? ruleState.calledEightPocket : null;
        const pockets = calledEightPocket ? this.pocketSystem.getPockets().filter(pocket => pocket.name === calledEightPocket) : this.pocketSystem.getPockets();
        const routes = [];
        for (const target of targetBodies) {
            for (const pocket of pockets) {
                const route = this.#buildPocketRoute({
                    target,
                    pocket,
                    activeObjects
                });
                if (route) {
                    routes.push(route);
                }
            }
        }
        routes.sort((a, b) => b.geometryScore - a.geometryScore);
        const selectedRoutes = routes.slice(0, profile.maxGeometricRoutes);
        const candidates = [];
        for (const route of selectedRoutes) {
            const basePower = clampPower(0.27 + route.cueDistance * 0.13 + route.objectDistance * 0.09);
            for (const powerFactor of profile.powerFactors) {
                for (const aimOffsetDeg of profile.aimOffsetsDeg) {
                    candidates.push({
                        kind: "POCKET_ROUTE",
                        targetNumber: route.targetNumber,
                        targetLabel: route.targetLabel,
                        pocketName: route.pocketName,
                        yawDeg: route.yawDeg + aimOffsetDeg,
                        elevationDeg: 0,
                        hitU: 0,
                        hitV: 0,
                        power: clampPower(basePower * powerFactor),
                        aimOffsetDeg,
                        geometryScore: route.geometryScore,
                        cutCosine: route.cutCosine,
                        cueDistance: route.cueDistance,
                        objectDistance: route.objectDistance
                    });
                }
            }
        }
        if (candidates.length > 0) {
            return candidates;
        }
        const fallbackTargets = [...targetBodies].sort((a, b) => this.cueBallBody.position.distanceToSquared(a.position) - this.cueBallBody.position.distanceToSquared(b.position)).slice(0, profile.maxFallbackTargets);
        for (const target of fallbackTargets) {
            _cueToGhost.subVectors(target.position, this.cueBallBody.position);
            _cueToGhost.y = 0;
            if (_cueToGhost.lengthSq() <= 1e-12) {
                continue;
            }
            _cueToGhost.normalize();
            const yaw = yawDegForDirection(_cueToGhost);
            for (const power of [0.34, 0.52, 0.72]) {
                candidates.push({
                    kind: "LEGAL_CONTACT",
                    targetNumber: parseBallNumber(target.label),
                    targetLabel: target.label,
                    pocketName: null,
                    yawDeg: yaw,
                    elevationDeg: 0,
                    hitU: 0,
                    hitV: 0,
                    power,
                    aimOffsetDeg: 0,
                    geometryScore: 0,
                    cutCosine: null,
                    cueDistance: this.cueBallBody.position.distanceTo(target.position),
                    objectDistance: null
                });
            }
        }
        return candidates;
    }
    #generateBreakCandidates(profile) {
        const activeObjects = this.objectBallBodies.filter(isInPlay);
        if (activeObjects.length === 0) {
            return [];
        }
        _rackCenter.set(0, 0, 0);
        for (const body of activeObjects) {
            _rackCenter.add(body.position);
        }
        _rackCenter.multiplyScalar(1 / activeObjects.length);
        _cueToGhost.subVectors(_rackCenter, this.cueBallBody.position);
        _cueToGhost.y = 0;
        if (_cueToGhost.lengthSq() <= 1e-12) {
            return [];
        }
        _cueToGhost.normalize();
        const baseYaw = yawDegForDirection(_cueToGhost);
        const candidates = [];
        for (const power of profile.breakPowers) {
            for (const offset of profile.breakAimOffsetsDeg) {
                candidates.push({
                    kind: "BREAK",
                    targetNumber: null,
                    targetLabel: "rack",
                    pocketName: null,
                    yawDeg: baseYaw + offset,
                    elevationDeg: 0,
                    hitU: 0,
                    hitV: 0,
                    power,
                    aimOffsetDeg: offset,
                    geometryScore: 0,
                    cutCosine: null,
                    cueDistance: this.cueBallBody.position.distanceTo(_rackCenter),
                    objectDistance: null
                });
            }
        }
        return candidates;
    }
    #buildPocketRoute({ target, pocket, activeObjects }) {
        _toPocket.subVectors(pocket.center, target.position);
        _toPocket.y = 0;
        const objectDistance = _toPocket.length();
        if (objectDistance <= 1e-6) {
            return null;
        }
        _objectDirection.copy(_toPocket).multiplyScalar(1 / objectDistance);
        _ghost.copy(target.position).addScaledVector(_objectDirection, -2 * target.radius);
        _ghost.y = this.cueBallBody.position.y;
        const margin = this.cueBallBody.radius + BOT_PLANNER.OBSTACLE_CLEARANCE;
        if (_ghost.x < this.playingSurfaceBox.min.x + margin || _ghost.x > this.playingSurfaceBox.max.x - margin || _ghost.z < this.playingSurfaceBox.min.z + margin || _ghost.z > this.playingSurfaceBox.max.z - margin) {
            return null;
        }
        const objectPathBlocked = segmentBlocked({
            a: target.position,
            b: pocket.center,
            bodies: activeObjects,
            skip: [target],
            minimumDistance: target.radius * 2 + BOT_PLANNER.OBSTACLE_CLEARANCE
        });
        if (objectPathBlocked) {
            return null;
        }
        const cuePathBlocked = segmentBlocked({
            a: this.cueBallBody.position,
            b: _ghost,
            bodies: activeObjects,
            skip: [target],
            minimumDistance: this.cueBallBody.radius * 2 + BOT_PLANNER.OBSTACLE_CLEARANCE
        });
        if (cuePathBlocked) {
            return null;
        }
        _cueToGhost.subVectors(_ghost, this.cueBallBody.position);
        _cueToGhost.y = 0;
        const cueDistance = _cueToGhost.length();
        if (cueDistance <= 1e-6) {
            return null;
        }
        _incoming.copy(_cueToGhost).multiplyScalar(1 / cueDistance);
        const cutCosine = _incoming.dot(_objectDirection);
        if (cutCosine < BOT_PLANNER.MIN_CUT_COSINE) {
            return null;
        }
        const yawDeg = yawDegForDirection(_incoming);
        const geometryScore = cutCosine * 4.0 - cueDistance * 0.55 - objectDistance * 0.35;
        return {
            targetNumber: parseBallNumber(target.label),
            targetLabel: target.label,
            pocketName: pocket.name,
            yawDeg,
            cutCosine,
            cueDistance,
            objectDistance,
            geometryScore
        };
    }
    #legalTargetNumbers(ruleState) {
        const current = ruleState.players[ruleState.currentPlayer];
        if (ruleState.currentPlayerOnEight) {
            return [8];
        }
        if (!current?.group) {
            return [
                1, 2, 3, 4, 5, 6, 7,
                9, 10, 11, 12, 13, 14, 15
            ];
        }
        return [
            ...(current.remaining ?? [])
        ];
    }

    //SCORING
    #scoreSimulation({ candidate, simulation, ruleState }) {
        const summary = simulation.summary ?? {};
        const firstNumber = parseBallNumber(summary.firstObjectContact);
        const legalTargets = new Set(this.#legalTargetNumbers(ruleState));
        const pocketed = summarizePocketedNumbers(summary);
        const scratch = Boolean(summary.scratch);
        let score = 0;
        const reasons = [];
        if (ruleState.tableState === EightBallTableState.BREAK) {
            const objectPocketed = pocketed.filter(entry => entry.number !== null && entry.number !== 0);
            score += objectPocketed.length * 330;
            score += Math.min(summary.uniqueObjectRailBallCount ?? 0, 8) * 24;
            const legalBreak = objectPocketed.length > 0 || (summary.uniqueObjectRailBallCount ?? 0) >= 4;
            if (legalBreak) {
                score += 180;
                reasons.push("legal break");
            }
            else {
                score -= 1100;
                reasons.push("illegal break");
            }
            if (scratch) {
                score -= 1300;
                reasons.push("scratch");
            }
            score -= candidate.power * 8;
        }
        else {
            if (firstNumber === null) {
                score -= 1000;
                reasons.push("no object contact");
            }
            else if (legalTargets.has(firstNumber)) {
                score += 180;
                reasons.push("legal first contact");
            }
            else {
                score -= 950;
                reasons.push("wrong first ball");
            }
            if (firstNumber !== null && !summary.railAfterFirstObjectContact && !summary.pocketAfterFirstObjectContact) {
                score -= 520;
                reasons.push("no rail/pocket after hit");
            }
            if (scratch) {
                score -= 1400;
                reasons.push("scratch");
            }
            const current = ruleState.players[ruleState.currentPlayer];
            for (const entry of pocketed) {
                const number = entry.number;
                if (number === null) {
                    continue;
                }
                if (number === 8) {
                    if (ruleState.currentPlayerOnEight && (!candidate.pocketName || entry.pocket === candidate.pocketName)) {
                        score += 2600;
                        reasons.push("8-ball made");
                    }
                    else {
                        score -= 2800;
                        reasons.push("illegal 8-ball");
                    }
                    continue;
                }
                const group = groupForBall(number);
                if (!current?.group) {
                    if (group) {
                        score += 520;
                        reasons.push(`open-table pocket ${number}`);
                    }
                }
                else if (group === current.group) {
                    score += 680;
                    reasons.push(`own ball ${number}`);
                }
                else if (group) {
                    score -= 70;
                }
                if (number === candidate.targetNumber) {
                    score += entry.pocket === candidate.pocketName ? 280 : 120;
                }
            }
            if (!scratch && simulation.finalCuePosition) {
                const pocketedSet = new Set(pocketed.map(entry => entry.number));
                const remainingTargets = this.objectBallBodies.filter(body => {
                    if (!isInPlay(body)) {
                        return false;
                    }
                    const number = parseBallNumber(body.label);
                    return (legalTargets.has(number) && !pocketedSet.has(number));
                });
                if (remainingTargets.length > 0) {
                    let nearest = Number.POSITIVE_INFINITY;
                    for (const body of remainingTargets) {
                        const dx = simulation.finalCuePosition.x - body.position.x;
                        const dz = simulation.finalCuePosition.z - body.position.z;
                        nearest = Math.min(nearest, Math.hypot(dx, dz));
                    }
                    score += 120 / (1 + nearest);
                }
            }
            score += candidate.geometryScore * 8;
            score -= candidate.power * 10;
        }
        return {
            score,
            candidate,
            firstObjectContact: summary.firstObjectContact ?? null,
            pocketed: pocketed.map(entry => entry.number),
            scratch,
            railAfterFirstObjectContact: Boolean(summary.railAfterFirstObjectContact),
            uniqueObjectRailBallCount: summary.uniqueObjectRailBallCount ?? 0,
            simulatedTime: simulation.simulatedTime,
            finalCuePosition: simulation.finalCuePosition,
            reasons
        };
    }
    #makeTableSignature(ruleState) {
        const parts = [
            this.difficulty,
            ruleState.tableState,
            String(ruleState.currentPlayer),
            ruleState.calledEightPocket ?? "NONE",
            ruleState.currentPlayerOnEight ? "ON8" : "NOT8"
        ];
        for (const player of ruleState.players) {
            parts.push(player.group ?? "OPEN", (player.remaining ?? []).join(","));
        }
        for (const body of [
            this.cueBallBody,
            ...this.objectBallBodies
        ]) {
            if (body !== this.cueBallBody && !isInPlay(body)) {
                continue;
            }
            parts.push(body.label, body.position.x.toFixed(4), body.position.y.toFixed(4), body.position.z.toFixed(4), body.state, body.pocketCommitted ? "P" : "-");
        }
        return parts.join("|");
    }
}
