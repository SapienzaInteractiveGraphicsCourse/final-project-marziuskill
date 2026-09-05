//Wires the scene, rules, physics, controls, bot, cinematics and audio into the running game.

//DEPENDENCIES
import * as THREE from "three";
import { SceneManager } from "./graphics/SceneManager.js";
import { LightingSystem } from "./graphics/LightingSystem.js";
import { PubEnvironment } from "./graphics/PubEnvironment.js";
import { ScoreboardSystem } from "./graphics/ScoreboardSystem.js";
import { IntroSequence } from "./graphics/IntroSequence.js";
import { PlayerGameplayController } from "./graphics/PlayerGameplayController.js";
import { CpuCueAnimator, CpuCueAnimationPhase } from "./graphics/CpuCueAnimator.js";
import { TriangleAnimationSystem, TriangleAnimation } from "./graphics/TriangleAnimationSystem.js";
import { VfxTestHarness } from "./graphics/VfxTestHarness.js";
import { TableEffectsManager, TABLE_EFFECT_COLORS } from "./graphics/TableEffectsManager.js";
import { EndMatchCinematicController, EndMatchResult } from "./graphics/EndMatchCinematicController.js";
import { BilliardsAssets, BALL_ASSET_NAMES } from "./assets/BilliardsAssets.js";
import { CueBall } from "./objects/CueBall.js";
import { BilliardBall } from "./objects/BilliardBall.js";
import { CueRig } from "./objects/CueRig.js";
import { CueClearanceSystem } from "./systems/CueClearanceSystem.js";
import { PlayingSurfaceSystem } from "./systems/PlayingSurfaceSystem.js";
import { PocketSystem } from "./systems/PocketSystem.js";
import { ShotSystem } from "./systems/ShotSystem.js";
import { TrajectoryPreviewSystem } from "./systems/TrajectoryPreviewSystem.js";
import { InputManager } from "./input/InputManager.js";
import { UIManager } from "./ui/UIManager.js";
import { StartScreen, StartMode } from "./ui/StartScreen.js";
import { PauseMenu } from "./ui/PauseMenu.js";
import { GameplayHUD } from "./ui/GameplayHUD.js";
import { MatchController } from "./game/MatchController.js";
import { SoloChallenge } from "./game/SoloChallenge.js";
import { RuleMode } from "./game/RuleSet8Ball.js";
import { BallInHandSystem, BallInHandMode } from "./game/BallInHandSystem.js";
import { BotShotSimulator } from "./bot/BotShotSimulator.js";
import { BotPlanner } from "./bot/BotPlanner.js";
import { CpuPlayerController, CpuTurnState } from "./bot/CpuPlayerController.js";
import { AudioManager } from "./audio/AudioManager.js";
import { EventType } from "./events/EventTypes.js";
import { RigidBall, BallState } from "./physics/RigidBall.js";
import { PhysicsWorld } from "./physics/PhysicsWorld.js";
import { RailCollisionSystem } from "./physics/RailCollisionSystem.js";
import { BallReturnCollisionSystem } from "./physics/BallReturnCollisionSystem.js";
import { PocketCaptureSystem } from "./physics/PocketCaptureSystem.js";
import { CueImpactSystem } from "./physics/CueImpactSystem.js";
import { BALL, BALL_IN_HAND, PHYSICS, CUE_RIG, RACK, SHOT, TURN } from "./config/constants.js";
import { getBallNumberForAsset, getBallAssetForNumber, makeLogicalBallLabel } from "./config/ballMapping.js";
import "./style.css";

//APPLICATION STATE
const container = document.querySelector("#app");
const status = document.querySelector("#status");
const sceneManager = new SceneManager(container);
const clock = new THREE.Clock();
let cueBall = null;
let cueBallBody = null;
let cueRig = null;
let objectBallVisuals = [];
let objectBallBodies = [];
let objectBallStartPositions = [];
let clearanceSystem = null;
let playingSurfaceSystem = null;
let pocketSystem = null;
let physicsWorld = null;
let railCollisionSystem = null;
let pocketCaptureSystem = null;
let ballReturnCollisionSystem = null;
let cueImpactSystem = null;
let shotSystem = null;
let trajectoryPreviewSystem = null;
let matchController = null;
let ballInHandSystem = null;
let botPlanner = null;
let cpuPlayerController = null;
let inputManager = null;
let uiManager = null;
let pubEnvironment = null;
let scoreboardSystem = null;
let soloChallenge = null;
let gameSelection = null;
let gameplayReady = false;
let playerGameplayController = null;
let cpuCueAnimator = null;
let triangleAnimationSystem = null;
let tableEffectsManager = null;
let vfxTestHarness = null;
let vfxTestModeActive = false;
let vfxKillSelectionTimer = null;
let gameplayHud = null;
let pauseMenu = null;
let gamePaused = false;
let endMatchCinematic = null;
let audioManager = null;
let kitchenRegion = null;
let activeHumanBallInHandMode = null;
let activeHumanBallInHandPreferredPosition = null;
let pendingCueReleasePlacement = null;
let eightPocketSelectionState = null;
let selectorEventsInstalled = false;
let activePhysicsShotDiagnostic = null;
let lastPhysicsShotDiagnostic = null;
let physicsDiagnosticEventsInstalled = false;
let lastKillShotSetup = null;
let clothYGlobal = null;
let playingSurfaceBoxGlobal = null;
let accumulator = 0;
let nextShotSettledTime = 0;
let cueBallStartPosition = null;

//TUNING
const SCOREBOARD_GROUP_BALL_COUNT = 7;
const PUB_LIGHT_INTENSITY_SCALE = 0.60;
const PUB_LIGHT_TINT = new THREE.Color(0x9b7cff);
const PUB_LIGHT_TINT_MIX = 0.24;
const TABLE_LIGHT_INTENSITY_SCALE = 0.84;
const TABLE_LIGHT_TINT = new THREE.Color(0xffc58e);
const TABLE_LIGHT_TINT_MIX = 0.28;

//LIGHTING
function tuneStaticPubLighting(scene) {
    scene.traverse(object => {
        if (!object?.isLight) {
            return;
        }
        const name = object.name ?? "";
        if (name.includes("ScoreboardPictureLight") || name.includes("CueRackPictureLight")) {
            return;
        }
        const lowerName = name.toLowerCase();
        const isTableLight = lowerName.includes("poollight") || lowerName.includes("tablelight") || lowerName.includes("table_light") || lowerName.includes("billiard") || lowerName.includes("cloth");
        if (Number.isFinite(object.intensity)) {
            object.intensity *= isTableLight ? TABLE_LIGHT_INTENSITY_SCALE : PUB_LIGHT_INTENSITY_SCALE;
        }
        if (object.color?.isColor) {
            object.color.lerp(isTableLight ? TABLE_LIGHT_TINT : PUB_LIGHT_TINT, isTableLight ? TABLE_LIGHT_TINT_MIX : PUB_LIGHT_TINT_MIX);
        }
    });
}

//SCOREBOARD
//Translate Solo remaining-ball state into the pocketed-ball count expected by the chalkboard.
function getScoreboardRuleState(ruleState) {
    if (!ruleState?.solo || !Array.isArray(ruleState.players) || !ruleState.players[0]) {
        return ruleState;
    }
    const marzius = ruleState.players[0];
    const remainingCount = Array.isArray(marzius.remaining) ? marzius.remaining.length : SCOREBOARD_GROUP_BALL_COUNT;
    const pocketedCount = marzius.group ? THREE.MathUtils.clamp(SCOREBOARD_GROUP_BALL_COUNT - remainingCount, 0, SCOREBOARD_GROUP_BALL_COUNT) : 0;
    const players = ruleState.players.map((player, index) => index === 0 ? {
        ...player,
        remaining: new Array(pocketedCount).fill(null)
    } : player);
    return {
        ...ruleState,
        players
    };
}

//PAUSE
//Keep rendering active while gameplay time is frozen so resume never receives a large catch-up delta.
function setGamePaused(active) {
    const next = Boolean(active);
    if (gamePaused === next) {
        return;
    }
    gamePaused = next;
    document.body.classList.toggle("game-paused", next);
    playerGameplayController?.setPaused?.(next);
    cpuPlayerController?.setPaused?.(next);
    audioManager?.setGamePaused?.(next);
}
function syncScoreboard() {
    if (!scoreboardSystem || !matchController) {
        return;
    }
    if (endMatchCinematic?.isActive?.()) {
        return;
    }
    scoreboardSystem.sync({
        ruleState: getScoreboardRuleState(matchController.getRuleState()),
        soloState: soloChallenge?.getState() ?? null
    });
}
function normalizeWinnerIndex(value) {
    if (Number.isInteger(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "0" || normalized.includes("marzius") || normalized.includes("player 1")) {
            return 0;
        }
        if (normalized === "1" || normalized.includes("kill") || normalized.includes("player 2")) {
            return 1;
        }
    }
    if (value && typeof value === "object") {
        for (const key of ["index", "player", "playerIndex", "winner", "winnerIndex"]) {
            if (value[key] !== undefined) {
                const parsed = normalizeWinnerIndex(value[key]);
                if (parsed != null) {
                    return parsed;
                }
            }
        }
        for (const key of ["name", "playerName", "winnerName"]) {
            if (value[key] !== undefined) {
                const parsed = normalizeWinnerIndex(value[key]);
                if (parsed != null) {
                    return parsed;
                }
            }
        }
    }
    return null;
}
function resolveEndMatchWinnerIndex(ruling) {
    const ruleState = matchController?.getRuleState?.() ?? null;
    const containers = [
        ruling,
        ruleState?.lastRuling,
        ruleState
    ];
    const winnerKeys = [
        "winner",
        "winnerIndex",
        "winnerPlayer",
        "winningPlayer",
        "winningPlayerIndex",
        "winnerName"
    ];
    for (const container of containers) {
        if (!container) {
            continue;
        }
        for (const key of winnerKeys) {
            if (container[key] !== undefined) {
                const parsed = normalizeWinnerIndex(container[key]);
                if (parsed != null) {
                    return parsed;
                }
            }
        }
    }
    const reasonText = [
        ruling?.reason,
        ruling?.message,
        ruleState?.gameOverReason,
        ruleState?.lastRuling?.reason,
        ruleState?.lastRuling?.message
    ].filter(Boolean).join(" ").toUpperCase();
    if (ruleState?.solo) {
        const soloLoss = /LOSS|LOSE|LIMIT|FOUL|EARLY|SCRATCH|WRONG|OFF[ _-]?TABLE|ILLEGAL/.test(reasonText);
        return soloLoss ? 1 : 0;
    }
    const shooter = Number.isInteger(ruleState?.currentPlayer) ? ruleState.currentPlayer : 0;
    const shooterLost = /EARLY|SCRATCH|WRONG|OFF[ _-]?TABLE|FOUL|ILLEGAL|LOSE|LOSS/.test(reasonText);
    return shooterLost ? (shooter === 0 ? 1 : 0) : shooter;
}

//END MATCH
//Freeze normal controllers before the cinematic takes ownership of the camera and shared props.
function startEndMatchCinematic(ruling) {
    const winnerIndex = resolveEndMatchWinnerIndex(ruling);
    const result = winnerIndex === 0 ? EndMatchResult.VICTORY : EndMatchResult.DEFEAT;
    const reason = ruling?.reason ?? matchController?.getRuleState?.()?.gameOverReason ?? null;
    if (endMatchCinematic?.start(result, { reason })) {
        console.info(`[END-CINEMATIC] ${result} · winner index ${winnerIndex}`, { ruling, reason });
        return true;
    }
    return false;
}

//CAMERA HELPERS
function captureCameraPose() {
    return {
        position: sceneManager.camera.position.clone(),
        quaternion: sceneManager.camera.quaternion.clone(),
        up: sceneManager.camera.up.clone(),
        near: sceneManager.camera.near,
        far: sceneManager.camera.far,
        controlsTarget: sceneManager.controls.target.clone(),
        controlsEnabled: sceneManager.controls.enabled
    };
}
function applyCameraPose(pose) {
    if (!pose) {
        return;
    }
    sceneManager.camera.position.copy(pose.position);
    sceneManager.camera.quaternion.copy(pose.quaternion);
    sceneManager.camera.up.copy(pose.up);
    sceneManager.camera.near = pose.near;
    sceneManager.camera.far = pose.far;
    sceneManager.camera.updateProjectionMatrix();
    sceneManager.camera.updateMatrixWorld(true);
    if (pose.controlsTarget) {
        sceneManager.controls.target.copy(pose.controlsTarget);
    }
    if (typeof pose.controlsEnabled === "boolean") {
        sceneManager.controls.enabled = pose.controlsEnabled;
    }
    if (sceneManager.controls.enabled) {
        sceneManager.controls.update();
    }
}

//BALL IN HAND
function projectPointerToCueBallPlacementPlane(clientX, clientY) {
    const canvas = sceneManager.renderer?.domElement;
    if (!canvas || !cueBallBody || clothYGlobal == null) {
        return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, sceneManager.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(clothYGlobal + BALL.RADIUS));
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) {
        return null;
    }
    hit.y = clothYGlobal + BALL.RADIUS;
    return hit;
}
function buildBallInHandSnapCandidates(anchor, mode) {
    const base = anchor.clone();
    if (playingSurfaceBoxGlobal) {
        const margin = BALL.RADIUS + BALL_IN_HAND.EDGE_MARGIN;
        base.x = THREE.MathUtils.clamp(base.x, playingSurfaceBoxGlobal.min.x + margin, playingSurfaceBoxGlobal.max.x - margin);
        base.z = THREE.MathUtils.clamp(base.z, playingSurfaceBoxGlobal.min.z + margin, playingSurfaceBoxGlobal.max.z - margin);
    }
    if (mode === BallInHandMode.KITCHEN && kitchenRegion?.axis && kitchenRegion?.headString != null) {
        const axis = kitchenRegion.axis;
        const epsilon = BALL_IN_HAND.HEAD_STRING_EPSILON + 0.0002;
        base[axis] = kitchenRegion.headPositive ? Math.min(base[axis], kitchenRegion.headString - epsilon) : Math.max(base[axis], kitchenRegion.headString + epsilon);
    }
    const candidates = [
        base.clone()
    ];
    if (base.distanceToSquared(anchor) > 1e-10) {
        candidates.push(anchor.clone());
    }
    const ringRadii = [
        0.006,
        0.012,
        0.020,
        0.030,
        0.042,
        0.056,
        0.074,
        0.096,
        0.122,
        0.152
    ];
    const samplesPerRing = [
        8,
        10,
        12,
        14,
        16,
        18,
        20,
        22,
        24,
        28
    ];
    for (let ringIndex = 0; ringIndex < ringRadii.length; ringIndex += 1) {
        const radius = ringRadii[ringIndex];
        const sampleCount = samplesPerRing[ringIndex];
        for (let i = 0; i < sampleCount; i += 1) {
            const angle = (i / sampleCount) * Math.PI * 2;
            const candidate = new THREE.Vector3(base.x + Math.cos(angle) * radius, base.y, base.z + Math.sin(angle) * radius);
            if (playingSurfaceBoxGlobal) {
                const margin = BALL.RADIUS + BALL_IN_HAND.EDGE_MARGIN;
                candidate.x = THREE.MathUtils.clamp(candidate.x, playingSurfaceBoxGlobal.min.x + margin, playingSurfaceBoxGlobal.max.x - margin);
                candidate.z = THREE.MathUtils.clamp(candidate.z, playingSurfaceBoxGlobal.min.z + margin, playingSurfaceBoxGlobal.max.z - margin);
            }
            if (mode === BallInHandMode.KITCHEN && kitchenRegion?.axis && kitchenRegion?.headString != null) {
                const axis = kitchenRegion.axis;
                const epsilon = BALL_IN_HAND.HEAD_STRING_EPSILON + 0.0002;
                candidate[axis] = kitchenRegion.headPositive ? Math.min(candidate[axis], kitchenRegion.headString - epsilon) : Math.max(candidate[axis], kitchenRegion.headString + epsilon);
            }
            candidates.push(candidate);
        }
    }
    return candidates;
}
function installBallInHandSnapAssist() {
    const canvas = sceneManager.renderer?.domElement;
    if (!canvas) {
        return;
    }
    let pointerDown = null;
    canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0 || !ballInHandSystem?.isActive() || cpuPlayerController?.isCpuTurn?.()) {
            pointerDown = null;
            return;
        }
        pointerDown = {
            x: event.clientX,
            y: event.clientY,
            cameraPose: captureCameraPose()
        };
    });
    window.addEventListener("pointerup", event => {
        const down = pointerDown;
        pointerDown = null;
        if (!down || event.button !== 0 || !ballInHandSystem?.isActive() || cpuPlayerController?.isCpuTurn?.()) {
            return;
        }
        const pixelDistance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
        if (pixelDistance > 8) {
            return;
        }
        const requested = projectPointerToCueBallPlacementPlane(event.clientX, event.clientY);
        if (!requested) {
            applyCameraPose(down.cameraPose);
            return;
        }
        const mode = activeHumanBallInHandMode ?? BallInHandMode.ANYWHERE;
        const state = ballInHandSystem.getState?.();
        const nativePosition = state?.position ? new THREE.Vector3(state.position.x, state.position.y ?? cueBallBody.position.y, state.position.z) : null;
        const nativeAccepted = state?.valid === true && nativePosition && nativePosition.distanceTo(requested) <= 0.008;
        if (!nativeAccepted) {
            const placement = ballInHandSystem.placeAutomatically({
                mode,
                preferredPositions: buildBallInHandSnapCandidates(requested, mode)
            });
            if (placement?.success) {
                const snapped = cueBallBody.position.clone();
                ballInHandSystem.begin({
                    preferredPosition: snapped,
                    mode
                });
            }
        }
        applyCameraPose(down.cameraPose);
    });
}

//BALL HELPERS
function getObjectBallIndexForNumber(number) {
    const assetName = getBallAssetForNumber(number);
    if (!assetName) {
        return -1;
    }
    return (BALL_ASSET_NAMES.indexOf(assetName) - 1);
}
function spotEightBall() {
    const eightIndex = getObjectBallIndexForNumber(8);
    if (!Number.isFinite(clothYGlobal) || !playingSurfaceBoxGlobal || eightIndex < 0 || !objectBallBodies[eightIndex] || !objectBallStartPositions[eightIndex]) {
        return;
    }
    const eightBody = objectBallBodies[eightIndex];
    const desired = objectBallStartPositions[eightIndex].clone();
    const position = findFreeRespotPosition(desired, eightBody, [
        cueBallBody,
        ...objectBallBodies
    ], playingSurfaceBoxGlobal);
    resetBody(eightBody, position, 0);
    eightBody.position.y = clothYGlobal + BALL.RADIUS;
    eightBody.setAtRest();
    eightBody.hasSupport = true;
}
function resetObjectRackForRebreak() {
    if (objectBallBodies.length !== objectBallStartPositions.length) {
        return;
    }
    for (let i = 0; i < objectBallBodies.length; i += 1) {
        resetBody(objectBallBodies[i], objectBallStartPositions[i], 0);
        objectBallBodies[i].position.y = clothYGlobal + BALL.RADIUS;
        objectBallBodies[i].setAtRest();
        objectBallBodies[i].hasSupport = true;
    }
    accumulator = 0;
    nextShotSettledTime = 0;
    physicsWorld?.resetCollisionStats();
    for (const visual of objectBallVisuals) {
        visual.syncFromPhysics();
    }
    trajectoryPreviewSystem?.invalidate();
}
function finalizeCueBallRelease(targetPosition = cueBallStartPosition) {
    if (!cueBallBody || !targetPosition) {
        return;
    }
    const target = targetPosition.clone();
    target.y = clothYGlobal + BALL.RADIUS;
    resetBody(cueBallBody, target, BALL.INITIAL_YAW_DEG);
    cueBallBody.setAtRest();
    cueBallBody.hasSupport = true;
    cueBall?.syncFromPhysics();
    trajectoryPreviewSystem?.invalidate();
}
function rackHasMeaningfulDisplacement() {
    if (objectBallBodies.length !== objectBallStartPositions.length) {
        return false;
    }
    const thresholdSq = Math.pow(0.0005, 2);
    return objectBallBodies.some((body, index) => {
        const start = objectBallStartPositions[index];
        const dx = body.position.x - start.x;
        const dz = body.position.z - start.z;
        return (body.pocketCommitted || [
            BallState.FALLEN,
            BallState.COLLECTED,
            BallState.RETURNING,
            BallState.POCKET_CAPTURED
        ].includes(body.state) || dx * dx + dz * dz > thresholdSq);
    });
}
function parseBallNumber(label) {
    if (typeof label !== "string") {
        return null;
    }
    const match = /^Ball\s+(\d+)$/.exec(label.trim());
    if (!match) {
        return null;
    }
    const value = Number(match[1]);
    return Number.isInteger(value) ? value : null;
}
function isCueBallPocketedForVfx(ruling) {
    if (ruling?.scratch || cueBallBody?.pocketCommitted) {
        return true;
    }
    return [
        BallState.FALLEN,
        BallState.COLLECTED,
        BallState.RETURNING,
        BallState.POCKET_CAPTURED
    ].includes(cueBallBody?.state);
}

//EIGHT BALL CALL
function probeTopDownPose(mode = BallInHandMode.ANYWHERE, preferredPosition = cueBallBody?.position ?? cueBallStartPosition) {
    if (!ballInHandSystem) {
        return captureCameraPose();
    }
    const fromPose = captureCameraPose();
    ballInHandSystem.begin({
        preferredPosition,
        mode
    });
    const topDownPose = captureCameraPose();
    ballInHandSystem.cancel();
    applyCameraPose(fromPose);
    return topDownPose;
}
function getEightBallBody() {
    return objectBallBodies.find(body => parseBallNumber(body.label) === 8) ?? null;
}
function resolvePocketFlashColor(body) {
    if (!body) {
        return TABLE_EFFECT_COLORS.WARNING;
    }
    if (body === cueBallBody || parseBallNumber(body.label) === 0) {
        return TABLE_EFFECT_COLORS.WARNING;
    }
    const ballNumber = parseBallNumber(body.label);
    const ruleState = matchController?.getRuleState?.();
    const player0Group = ruleState?.players?.[0]?.group ?? null;
    const player1Group = ruleState?.players?.[1]?.group ?? null;
    const toGroup = number => {
        if (number == null || number === 8) {
            return null;
        }
        return number <= 7 ? "SOLIDS" : "STRIPES";
    };
    const group = toGroup(ballNumber);
    if (!group) {
        return TABLE_EFFECT_COLORS.WARNING;
    }
    if (player0Group && group === player0Group) {
        return TABLE_EFFECT_COLORS.ALLY;
    }
    if (player1Group && group === player1Group) {
        return TABLE_EFFECT_COLORS.ENEMY;
    }
    return TABLE_EFFECT_COLORS.SELECT;
}
function resetEightPocketSelectionState() {
    eightPocketSelectionState = null;
    tableEffectsManager?.clearSelection?.();
}
function startHumanEightPocketSelection({ topDownPose = null, fromBallInHand = false, force = false, testMode = false, onConfirmed = null } = {}) {
    if (eightPocketSelectionState || !matchController || !tableEffectsManager || !playerGameplayController) {
        return false;
    }
    const ruleState = matchController.getRuleState();
    if (!force && (ruleState.currentPlayer !== 0 || !ruleState.mustCallEightPocket || ruleState.calledEightPocket)) {
        return false;
    }
    const pockets = tableEffectsManager.getPockets();
    const eightBall = getEightBallBody();
    if (!pockets.length || !eightBall) {
        return false;
    }
    let selectedIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < pockets.length; i += 1) {
        const distance = pockets[i].center.distanceToSquared(eightBall.position);
        if (distance < minDistance) {
            minDistance = distance;
            selectedIndex = i;
        }
    }
    eightPocketSelectionState = {
        active: false,
        pockets,
        selectedIndex,
        fromBallInHand,
        topDownPose: topDownPose ? topDownPose : null
    };
    const activate = () => {
        eightPocketSelectionState = {
            active: true,
            pockets,
            selectedIndex,
            fromBallInHand,
            topDownPose: topDownPose ? topDownPose : captureCameraPose(),
            testMode,
            onConfirmed
        };
        tableEffectsManager.setSelectionPocket(pockets[selectedIndex].name);
        gameplayHud?.setState("CALL POCKET · WASD choose · Enter confirm");
    };
    if (topDownPose) {
        applyCameraPose(topDownPose);
        activate();
        return true;
    }
    const targetPose = probeTopDownPose(BallInHandMode.ANYWHERE, cueBallBody.position.clone());
    playerGameplayController.enterTopDownSelection(targetPose, {
        hudText: "CALL POCKET · entering BEV",
        onComplete: activate
    });
    return true;
}
function moveHumanEightPocketSelection(screenX, screenY) {
    if (!eightPocketSelectionState?.active) {
        return false;
    }
    const pockets = eightPocketSelectionState.pockets;
    const current = pockets[eightPocketSelectionState.selectedIndex];
    const desired = new THREE.Vector2(screenX, screenY).normalize();
    const currentNdc = current.center.clone().project(sceneManager.camera);
    let bestIndex = eightPocketSelectionState.selectedIndex;
    let bestScore = 0.20;
    for (let i = 0; i < pockets.length; i += 1) {
        if (i === eightPocketSelectionState.selectedIndex) {
            continue;
        }
        const candidateNdc = pockets[i].center.clone().project(sceneManager.camera);
        const delta = new THREE.Vector2(candidateNdc.x - currentNdc.x, candidateNdc.y - currentNdc.y);
        const length = delta.length();
        if (length < 1e-6) {
            continue;
        }
        delta.divideScalar(length);
        const score = delta.dot(desired) + 0.08 / Math.max(0.08, length);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    if (bestIndex !== eightPocketSelectionState.selectedIndex) {
        eightPocketSelectionState.selectedIndex = bestIndex;
        tableEffectsManager.setSelectionPocket(pockets[bestIndex].name);
        return true;
    }
    return false;
}
function confirmHumanEightPocketSelection() {
    if (!eightPocketSelectionState?.active) {
        return false;
    }
    const pocket = eightPocketSelectionState.pockets[eightPocketSelectionState.selectedIndex];
    const exitPose = captureCameraPose();
    const testMode = !!eightPocketSelectionState.testMode;
    const onConfirmed = eightPocketSelectionState.onConfirmed;
    if (!testMode) {
        matchController.callEightPocket(pocket.name);
    }
    tableEffectsManager.activateBeacon({
        pocketName: pocket.name,
        ownerPlayer: 0,
        color: TABLE_EFFECT_COLORS.ALLY
    });
    tableEffectsManager.clearSelection();
    const fromBallInHand = eightPocketSelectionState.fromBallInHand;
    resetEightPocketSelectionState();
    onConfirmed?.(pocket.name);
    if (fromBallInHand) {
        playerGameplayController.afterBallInHandConfirmed(exitPose, {
            suppressEnter: true
        });
    }
    else {
        playerGameplayController.exitTopDownSelection(exitPose, {
            suppressEnter: true
        });
    }
    return true;
}
function maybeStartHumanEightPocketSelection() {
    if (vfxTestModeActive || eightPocketSelectionState || ballInHandSystem?.isActive?.()) {
        return false;
    }
    const ruleState = matchController?.getRuleState?.();
    if (!ruleState || ruleState.currentPlayer !== 0 || !ruleState.mustCallEightPocket || ruleState.calledEightPocket) {
        return false;
    }
    return startHumanEightPocketSelection();
}
function syncCalledPocketBeacon() {
    if (!tableEffectsManager || !matchController) {
        return;
    }
    const ruleState = matchController.getRuleState();
    const calledPocket = ruleState.calledEightPocket ?? null;
    const ownerPlayer = ruleState.currentPlayer;
    if (tableEffectsManager.beacon?.ownerPlayer != null && ownerPlayer !== tableEffectsManager.beacon.ownerPlayer) {
        tableEffectsManager.deactivateBeacon();
    }
    if (calledPocket && (tableEffectsManager.lastCalledPocket !== calledPocket || tableEffectsManager.lastCalledPocketPlayer !== ownerPlayer)) {
        tableEffectsManager.activateBeacon({
            pocketName: calledPocket,
            ownerPlayer,
            color: ownerPlayer === 0 ? TABLE_EFFECT_COLORS.ALLY : TABLE_EFFECT_COLORS.ENEMY
        });
    }
}
function installSelectorEvents() {
    if (selectorEventsInstalled) {
        return;
    }
    selectorEventsInstalled = true;
    window.addEventListener("keydown", event => {
        if (!eightPocketSelectionState?.active) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "enter") {
            confirmHumanEightPocketSelection();
            event.preventDefault();
            return;
        }
        if (key === "w") {
            moveHumanEightPocketSelection(0, 1);
            event.preventDefault();
        }
        else if (key === "s") {
            moveHumanEightPocketSelection(0, -1);
            event.preventDefault();
        }
        else if (key === "a") {
            moveHumanEightPocketSelection(-1, 0);
            event.preventDefault();
        }
        else if (key === "d") {
            moveHumanEightPocketSelection(1, 0);
            event.preventDefault();
        }
    });
}
function startPlayerEightPocketSelectionTest() {
    return startHumanEightPocketSelection({
        force: true,
        testMode: true,
        fromBallInHand: false,
        onConfirmed: pocketName => {
            console.info("[VFX-TEST] PLAYER selected 8-ball pocket:", pocketName);
        }
    });
}
function startKillEightPocketSelectionTest() {
    if (!tableEffectsManager) {
        return false;
    }
    const eight = getEightBallBody();
    const pockets = tableEffectsManager.getPockets();
    if (!eight || pockets.length === 0) {
        return false;
    }
    const pocket = [...pockets].sort((a, b) => eight.position.distanceToSquared(a.center) - eight.position.distanceToSquared(b.center))[0];
    tableEffectsManager.setSelectionPocket(pocket.name);
    if (vfxKillSelectionTimer != null) {
        window.clearTimeout(vfxKillSelectionTimer);
    }
    vfxKillSelectionTimer = window.setTimeout(() => {
        vfxKillSelectionTimer = null;
        if (!vfxTestModeActive) {
            return;
        }
        tableEffectsManager.clearSelection();
        tableEffectsManager.activateBeacon({
            pocketName: pocket.name,
            ownerPlayer: 1,
            color: TABLE_EFFECT_COLORS.ENEMY
        });
    }, 520);
    return true;
}
function endEightPocketSelectionTest({ immediate = false } = {}) {
    if (vfxKillSelectionTimer != null) {
        window.clearTimeout(vfxKillSelectionTimer);
        vfxKillSelectionTimer = null;
    }
    if (eightPocketSelectionState?.testMode) {
        const exitPose = captureCameraPose();
        resetEightPocketSelectionState();
        if (playerGameplayController) {
            playerGameplayController.exitTopDownSelection(exitPose, {
                suppressEnter: true
            });
        }
    }
    else {
        tableEffectsManager?.clearSelection?.();
    }
    if (immediate) {
        tableEffectsManager?.deactivateBeacon?.();
    }
}

//RULE ACTIONS
//Apply rule consequences only after the completed shot has been ruled.
function applyRuleActions(ruling) {
    for (const action of ruling?.actions ?? []) {
        if (action.type === "RESPOT_EIGHT") {
            spotEightBall();
        }
    }
    return false;
}
function setCueBallPlacementShadowEnabled(enabled) {
    if (!cueBall?.traverse) {
        return;
    }
    cueBall.traverse(child => {
        if (!child.isMesh) {
            return;
        }
        child.userData ??= {};
        if (!enabled) {
            if (!("bihOriginalCastShadow" in child.userData)) {
                child.userData.bihOriginalCastShadow = child.castShadow;
            }
            child.castShadow = false;
            return;
        }
        if ("bihOriginalCastShadow" in child.userData) {
            child.castShadow = child.userData.bihOriginalCastShadow;
            delete child.userData.bihOriginalCastShadow;
        }
    });
}
function startBallInHand(mode, preferredPosition = cueBallStartPosition, { cuePreviewOpacity = 1 } = {}) {
    if (!ballInHandSystem || !matchController || !trajectoryPreviewSystem || !cueRig) {
        return false;
    }
    const isCpuPlacement = cpuPlayerController?.isCpuTurn?.() ?? false;
    const beginPlacement = () => {
        cueRig.visible = false;
        ballInHandSystem.begin({
            preferredPosition,
            mode
        });
        matchController.beginBallInHand();
        triangleAnimationSystem?.setCuePreviewOpacity?.(cuePreviewOpacity);
        setCueBallPlacementShadowEnabled(cuePreviewOpacity >= 0.999);
        trajectoryPreviewSystem.invalidate();
    };
    if (!isCpuPlacement && playerGameplayController) {
        activeHumanBallInHandMode = mode;
        activeHumanBallInHandPreferredPosition = preferredPosition?.clone?.() ?? preferredPosition ?? null;
        const fromPose = captureCameraPose();
        ballInHandSystem.begin({
            preferredPosition,
            mode
        });
        const topDownPose = captureCameraPose();
        ballInHandSystem.cancel();
        applyCameraPose(fromPose);
        trajectoryPreviewSystem.invalidate();
        playerGameplayController.animateIntoBallInHand(topDownPose, {
            onComplete: () => {
                beginPlacement();
            }
        });
        return true;
    }
    beginPlacement();
    return true;
}
function continueAfterRuling(ruling) {
    if (ruling?.gameOver) {
        trajectoryPreviewSystem.invalidate();
        if (!startEndMatchCinematic(ruling)) {
            cueRig.visible = false;
        }
        return;
    }
    if (ruling?.ballInHand) {
        const mode = ruling.placementMode === "KITCHEN" ? BallInHandMode.KITCHEN : BallInHandMode.ANYWHERE;
        const beginPlacementAfterPreVfx = () => {
            if (cpuPlayerController?.isCpuTurn()) {
                const handled = cpuPlayerController.handleBallInHand(mode);
                if (!handled) {
                    startBallInHand(mode, cueBallStartPosition);
                    return;
                }
                const targetPosition = cueBallBody.position.clone();
                triangleAnimationSystem?.setCuePreviewOpacity?.(0);
                if (triangleAnimationSystem?.startSequence([{
                        type: TriangleAnimation.CUE_RELEASE,
                        targetPosition
                    }], {
                    onComplete: () => {
                        triangleAnimationSystem?.setCuePreviewOpacity?.(1);
                    }
                })) {
                    return;
                }
                finalizeCueBallRelease(targetPosition);
                triangleAnimationSystem?.setCuePreviewOpacity?.(1);
                return;
            }
            pendingCueReleasePlacement = {
                mode,
                player: 0
            };
            startBallInHand(mode, cueBallStartPosition, { cuePreviewOpacity: 0.38 });
        };
        const illegalBreak = (ruling?.actions ?? []).some(action => action.type === "RESET_RACK_FOR_REBREAK");
        const rackMoved = illegalBreak && rackHasMeaningfulDisplacement();
        const cuePocketed = isCueBallPocketedForVfx(ruling);
        const preSteps = [];
        if (rackMoved) {
            preSteps.push({
                type: TriangleAnimation.RACK_RESET
            });
        }
        if (!cuePocketed) {
            preSteps.push({
                type: TriangleAnimation.CUE_RECOVER,
                sourcePosition: cueBallBody.position.clone(),
                targetPosition: cueBallStartPosition.clone()
            });
        }
        if (preSteps.length > 0 && triangleAnimationSystem?.startSequence(preSteps, {
            onComplete: beginPlacementAfterPreVfx
        })) {
            return;
        }
        if (rackMoved) {
            resetObjectRackForRebreak();
        }
        beginPlacementAfterPreVfx();
        return;
    }
    shotSystem.rearmForNextShot();
    cueRig.visible = false;
    cueRig.position.copy(cueBallBody.position);
    clearanceSystem.update(true);
    trajectoryPreviewSystem.invalidate();
}

//EVENT BRIDGE
//Route each physics event once so rules, diagnostics and audio stay synchronized.
function recordMatchPhysicsEvent(event) {
    const position = event?.position && Number.isFinite(event.position.x) && Number.isFinite(event.position.y) && Number.isFinite(event.position.z) ? event.position : null;
    if (event?.type === EventType.BALL_CONTACT) {
        const intensity = THREE.MathUtils.clamp((event.closingSpeed ?? 0) / 2.8, 0, 1);
        const pair = [event.a, event.b].filter(Boolean).sort().join("|");
        audioManager?.play?.("ballContact", {
            position,
            gain: 0.10 + intensity * 0.72,
            rate: 0.97 + Math.random() * 0.06,
            refDistance: 0.72,
            maxDistance: 9.5,
            rolloffFactor: 1.16,
            cooldownKey: pair || "ball-contact",
            cooldown: 0.022
        });
    }
    else if (event?.type === EventType.RAIL_CONTACT) {
        const intensity = THREE.MathUtils.clamp((event.closingSpeed ?? 0) / 2.5, 0, 1);
        audioManager?.play?.("railHit", {
            position,
            gain: 0.08 + intensity * 0.68,
            rate: 0.97 + Math.random() * 0.06,
            refDistance: 0.78,
            maxDistance: 9.5,
            rolloffFactor: 1.14,
            cooldownKey: `${event.ball ?? "ball"}:${event.rail ?? "rail"}`,
            cooldown: 0.030
        });
    }
    if (!matchController) {
        return;
    }
    matchController.recordPhysicsEvent({
        ...event,
        simulationTime: event.simulationTime ?? physicsWorld?.simulationTime ?? 0
    });
}

//PHYSICS DIAGNOSTICS
function diagnosticVector(vector) {
    return {
        x: Number(vector.x.toFixed(5)),
        y: Number(vector.y.toFixed(5)),
        z: Number(vector.z.toFixed(5)),
        length: Number(vector.length().toFixed(5))
    };
}
function getBreakApexIndex() {
    if (!cueBallStartPosition || objectBallStartPositions.length === 0) {
        return -1;
    }
    let bestIndex = -1;
    let bestDistanceSq = Infinity;
    for (let i = 0; i < objectBallStartPositions.length; i += 1) {
        const start = objectBallStartPositions[i];
        const dx = start.x - cueBallStartPosition.x;
        const dz = start.z - cueBallStartPosition.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestIndex = i;
        }
    }
    return bestIndex;
}
function getRackDiagnosticSummary() {
    const displacement = objectBallBodies.map((body, index) => {
        const start = objectBallStartPositions[index];
        const dx = body.position.x - start.x;
        const dz = body.position.z - start.z;
        return Math.hypot(dx, dz);
    });
    const movedOneRadius = displacement.filter(distance => distance >= BALL.RADIUS).length;
    const movedTwoRadii = displacement.filter(distance => distance >= BALL.RADIUS * 2).length;
    const movedFiveRadii = displacement.filter(distance => distance >= BALL.RADIUS * 5).length;
    return {
        movedAtLeastOneRadius: movedOneRadius,
        movedAtLeastTwoRadii: movedTwoRadii,
        movedAtLeastFiveRadii: movedFiveRadii,
        maxDisplacement: Number(Math.max(0, ...displacement).toFixed(5)),
        meanDisplacement: Number((displacement.reduce((sum, value) => sum + value, 0) / Math.max(1, displacement.length)).toFixed(5))
    };
}
function beginPhysicsShotDiagnostic({ source, power, impact = null }) {
    const apexIndex = getBreakApexIndex();
    const apexBody = apexIndex >= 0 ? objectBallBodies[apexIndex] : null;
    activePhysicsShotDiagnostic = {
        source,
        power,
        impact,
        startedSimulationTime: physicsWorld?.simulationTime ?? 0,
        apexIndex,
        apexBody,
        preApexLogged: false,
        postApexLogged: false,
        finished: false,
        minCenterDistance: Infinity,
        cueVelocityAfterImpact: cueBallBody.velocity.clone(),
        cueAngularVelocityAfterImpact: cueBallBody.angularVelocity.clone(),
        cuePositionAfterImpact: cueBallBody.position.clone(),
        preApexVelocity: null,
        preApexAngularVelocity: null,
        postApexCueVelocity: null,
        postApexBallVelocity: null,
        rackSummary: null
    };
    lastPhysicsShotDiagnostic = activePhysicsShotDiagnostic;
    console.groupCollapsed(`[BREAK-DIAG] ${source} · requested power ${(power * 100).toFixed(1)}%`);
    console.log("impact result", impact);
    console.table({
        power,
        yawDeg: cueRig?.getYawDeg?.() ?? null,
        elevationDeg: cueRig?.getElevationDeg?.() ?? null,
        hitU: shotSystem?.getHitOffset?.().u ?? null,
        hitV: shotSystem?.getHitOffset?.().v ?? null,
        cueSpeedAfterImpact: cueBallBody.velocity.length(),
        cueAngularSpeedAfterImpact: cueBallBody.angularVelocity.length(),
        apexIndex,
        apexLabel: apexBody?.label ?? "unknown"
    });
    console.log("cue velocity immediately after impact", diagnosticVector(cueBallBody.velocity));
    console.log("cue angular velocity immediately after impact", diagnosticVector(cueBallBody.angularVelocity));
    console.groupEnd();
}
function probePhysicsShotDiagnosticBeforeStep(dt) {
    const diagnostic = activePhysicsShotDiagnostic;
    if (!diagnostic || diagnostic.finished || !diagnostic.apexBody) {
        return;
    }
    const apexBody = diagnostic.apexBody;
    const centerDistance = cueBallBody.position.distanceTo(apexBody.position);
    diagnostic.minCenterDistance = Math.min(diagnostic.minCenterDistance, centerDistance);
    if (diagnostic.preApexLogged) {
        return;
    }
    const toApex = apexBody.position.clone().sub(cueBallBody.position);
    const horizontalToApex = toApex.clone();
    horizontalToApex.y = 0;
    const horizontalVelocity = cueBallBody.velocity.clone();
    horizontalVelocity.y = 0;
    const approaching = horizontalToApex.lengthSq() > 1e-10 && horizontalVelocity.dot(horizontalToApex) > 0;
    const contactDistance = BALL.RADIUS * 2;
    const cueSpeed = horizontalVelocity.length();
    const predictiveMargin = Math.max(0.002, cueSpeed * dt * 1.6);
    if (approaching && centerDistance <= contactDistance + predictiveMargin) {
        diagnostic.preApexLogged = true;
        diagnostic.preApexVelocity = cueBallBody.velocity.clone();
        diagnostic.preApexAngularVelocity = cueBallBody.angularVelocity.clone();
        console.groupCollapsed(`[BREAK-DIAG] immediately BEFORE apex contact · ${diagnostic.source}`);
        console.table({
            simulationTime: physicsWorld?.simulationTime ?? null,
            centerDistance,
            expectedContactDistance: contactDistance,
            cueSpeed: cueBallBody.velocity.length(),
            cueAngularSpeed: cueBallBody.angularVelocity.length(),
            apexSpeed: apexBody.velocity.length()
        });
        console.log("cue velocity before apex", diagnosticVector(cueBallBody.velocity));
        console.log("cue angular velocity before apex", diagnosticVector(cueBallBody.angularVelocity));
        console.groupEnd();
    }
}
function probePhysicsShotDiagnosticAfterStep() {
    const diagnostic = activePhysicsShotDiagnostic;
    if (!diagnostic || diagnostic.finished || !diagnostic.apexBody) {
        return;
    }
    const elapsed = (physicsWorld?.simulationTime ?? 0) - diagnostic.startedSimulationTime;
    const apexBody = diagnostic.apexBody;
    if (diagnostic.preApexLogged && !diagnostic.postApexLogged && apexBody.velocity.length() > 0.02) {
        diagnostic.postApexLogged = true;
        diagnostic.postApexCueVelocity = cueBallBody.velocity.clone();
        diagnostic.postApexBallVelocity = apexBody.velocity.clone();
        console.groupCollapsed(`[BREAK-DIAG] immediately AFTER apex contact · ${diagnostic.source}`);
        console.table({
            simulationTime: physicsWorld?.simulationTime ?? null,
            cueSpeed: cueBallBody.velocity.length(),
            apexSpeed: apexBody.velocity.length(),
            cueAngularSpeed: cueBallBody.angularVelocity.length()
        });
        console.log("cue velocity after apex", diagnosticVector(cueBallBody.velocity));
        console.log("apex velocity after contact", diagnosticVector(apexBody.velocity));
        console.groupEnd();
    }
    if (elapsed >= 1.75) {
        diagnostic.finished = true;
        diagnostic.rackSummary = getRackDiagnosticSummary();
        console.groupCollapsed(`[BREAK-DIAG] 1.75 s summary · ${diagnostic.source}`);
        console.table({
            requestedPower: diagnostic.power,
            speedImmediatelyAfterImpact: diagnostic.cueVelocityAfterImpact.length(),
            speedImmediatelyBeforeApex: diagnostic.preApexVelocity?.length?.() ?? null,
            minCueApexCenterDistance: diagnostic.minCenterDistance,
            ...diagnostic.rackSummary
        });
        console.log("full diagnostic object", diagnostic);
        console.groupEnd();
        activePhysicsShotDiagnostic = null;
    }
}
function fireDirectImpactDiagnostic({ power = 1, centerHit = true } = {}) {
    if (!cueImpactSystem || !cueBallBody || !cueRig || !shotSystem) {
        console.warn("[BREAK-DIAG] systems are not ready yet.");
        return false;
    }
    if (ballInHandSystem?.isActive?.() || triangleAnimationSystem?.isBusy?.()) {
        console.warn("[BREAK-DIAG] finish ball-in-hand / triangle animation first.");
        return false;
    }
    if (cueBallBody.velocity.length() > PHYSICS.REST_LINEAR_EPSILON * 2) {
        console.warn("[BREAK-DIAG] cue ball must be stationary before direct impact.");
        return false;
    }
    const requestedPower = THREE.MathUtils.clamp(Number.isFinite(power) ? power : 1, SHOT.MIN_POWER, SHOT.MAX_POWER);
    if (centerHit) {
        shotSystem.setHitOffset(0, 0);
    }
    cueRig.clearStrokeOffsetPreview?.();
    cueRig.position.copy(cueBallBody.position);
    cueRig.updateWorldMatrix(true, true);
    clearanceSystem.update(true);
    const impact = cueImpactSystem.applyImpact(cueBallBody, cueRig, requestedPower);
    if (!impact) {
        console.warn("[BREAK-DIAG] direct CueImpactSystem.applyImpact() returned no impact.");
        return false;
    }
    cueRig.visible = false;
    beginPhysicsShotDiagnostic({
        source: centerHit ? "DIRECT CueImpactSystem · center hit" : "DIRECT CueImpactSystem · current hit point",
        power: requestedPower,
        impact
    });
    console.info("[BREAK-DIAG] direct impact fired. This bypasses CueRig.startStroke() and ShotSystem.requestShot().");
    return true;
}
function cloneKillShotSetup(setup) {
    if (!setup) {
        return null;
    }
    return {
        ...setup,
        cueBallPosition: setup.cueBallPosition.clone(),
        shotDirection: setup.shotDirection.clone()
    };
}
function applyLastKillShotSetup({ fire = false } = {}) {
    if (!lastKillShotSetup) {
        console.warn("[KILL-SHOT] No KILL shot has been captured yet. Let KILL select a shot first.");
        return false;
    }
    if (!cueBallBody || !cueRig || !shotSystem || !clearanceSystem) {
        console.warn("[KILL-SHOT] gameplay systems are not ready.");
        return false;
    }
    if (ballInHandSystem?.isActive?.() || triangleAnimationSystem?.isBusy?.()) {
        console.warn("[KILL-SHOT] finish ball-in-hand / triangle animation first.");
        return false;
    }
    if (cueBallBody.velocity.length() > PHYSICS.REST_LINEAR_EPSILON * 2) {
        console.warn("[KILL-SHOT] wait until the cue ball is stationary.");
        return false;
    }
    if (fire && cpuPlayerController?.isCpuTurn?.()) {
        console.warn("[KILL-SHOT] F6 replay is intended for a human turn, after KILL's setup has been captured.");
        return false;
    }
    const setup = cloneKillShotSetup(lastKillShotSetup);
    shotSystem.rearmForNextShot();
    resetBody(cueBallBody, setup.cueBallPosition, BALL.INITIAL_YAW_DEG);
    cueBallBody.state = BallState.RESTING;
    cueBall.syncFromPhysics();
    cueRig.position.copy(cueBallBody.position);
    cueRig.setYawDeg(setup.yawDeg);
    shotSystem.setHitOffset(setup.hitU, setup.hitV);
    clearanceSystem.update(true);
    cueRig.setElevationDeg(setup.elevationDeg);
    clearanceSystem.update(true);
    shotSystem.setPower(setup.power);
    cueRig.clearStrokeOffsetPreview?.();
    cueRig.updateWorldMatrix(true, true);
    trajectoryPreviewSystem?.invalidate?.();
    const actualHit = shotSystem.getHitOffset();
    const actualDirection = cueRig.getShotDirectionWorld(new THREE.Vector3());
    console.groupCollapsed(`[KILL-SHOT] ${fire ? "replay + fire" : "setup loaded"}`);
    console.table({
        requestedCueX: setup.cueBallPosition.x,
        requestedCueZ: setup.cueBallPosition.z,
        requestedYawDeg: setup.yawDeg,
        actualYawDeg: cueRig.getYawDeg(),
        requestedElevationDeg: setup.elevationDeg,
        actualElevationDeg: cueRig.getElevationDeg(),
        requestedHitU: setup.hitU,
        actualHitU: actualHit.u,
        requestedHitV: setup.hitV,
        actualHitV: actualHit.v,
        requestedPower: setup.power,
        actualPower: shotSystem.getPower(),
        actualDirX: actualDirection.x,
        actualDirY: actualDirection.y,
        actualDirZ: actualDirection.z
    });
    console.groupEnd();
    if (!fire) {
        cueRig.visible = true;
        return true;
    }
    if (!matchController?.canStartShot?.() || !shotSystem.canShoot()) {
        console.warn("[KILL-SHOT] copied setup successfully, but the current match state does not permit a shot. Use F5 to inspect it or retry on a ready human turn.");
        cueRig.visible = true;
        return false;
    }
    const started = shotSystem.requestShot({
        skipCharge: true
    });
    if (!started) {
        console.warn("[KILL-SHOT] ShotSystem refused the replay shot.");
        return false;
    }
    console.info("[KILL-SHOT] firing the captured KILL setup through the normal ShotSystem path.");
    return true;
}
function installPhysicsDiagnosticControls() {
    if (physicsDiagnosticEventsInstalled) {
        return;
    }
    physicsDiagnosticEventsInstalled = true;
    window.billiardsDiagnostics = {
        fireDirect: (power = 1) => fireDirectImpactDiagnostic({
            power,
            centerHit: false
        }),
        fireDirectCenter: (power = 1) => fireDirectImpactDiagnostic({
            power,
            centerHit: true
        }),
        report: () => lastPhysicsShotDiagnostic,
        getKillSetup: () => cloneKillShotSetup(lastKillShotSetup),
        loadKillSetup: () => applyLastKillShotSetup({
            fire: false
        }),
        replayKillSetup: () => applyLastKillShotSetup({
            fire: true
        }),
        clear: () => {
            activePhysicsShotDiagnostic = null;
            lastPhysicsShotDiagnostic = null;
            console.info("[BREAK-DIAG] diagnostic state cleared.");
        }
    };
    window.addEventListener("keydown", event => {
        if (event.repeat) {
            return;
        }
        if (event.key === "F7") {
            event.preventDefault();
            fireDirectImpactDiagnostic({
                power: 1,
                centerHit: true
            });
        }
        else if (event.key === "F5") {
            event.preventDefault();
            applyLastKillShotSetup({
                fire: false
            });
        }
        else if (event.key === "F6") {
            event.preventDefault();
            applyLastKillShotSetup({
                fire: true
            });
        }
    });
    console.info("[BREAK-DIAG] F5 = load last KILL setup · F6 = replay it through ShotSystem · F7 = direct 100% center impact. Console: window.billiardsDiagnostics");
}

//TABLE RESET
function resetBody(body, position, initialYawDeg = 0) {
    body.position.copy(position);
    body.velocity.set(0, 0, 0);
    body.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(initialYawDeg));
    body.angularVelocity.set(0, 0, 0);
    body.contactSlipSpeed = 0;
    body.frictionRegime = "NONE";
    body.pocketName = null;
    body.pocketCommitted = false;
    body.returnSettledTime = 0;
    body.returnTargetId = null;
    body.returnFloorY = null;
    body.returnStage = null;
    body.returnLaneCoordinate = null;
    body.state = "AIRBORNE";
}
function alignInitialBreakAxis(importedPositions, playingSurfaceBox) {
    if (importedPositions.length !== 16) {
        throw new Error(`Expected 16 imported ball positions, got ${importedPositions.length}.`);
    }
    const corrected = importedPositions.map(position => position.clone());
    const surfaceCenter = new THREE.Vector3();
    playingSurfaceBox.getCenter(surfaceCenter);
    const cue = corrected[0];
    const rack = corrected.slice(1);
    let apexRackIndex = 0;
    let bestLongitudinalDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < rack.length; i += 1) {
        const dz = Math.abs(rack[i].z - cue.z);
        if (dz < bestLongitudinalDistance) {
            bestLongitudinalDistance = dz;
            apexRackIndex = i;
        }
    }
    const apex = rack[apexRackIndex];
    const cueShiftX = surfaceCenter.x - cue.x;
    const rackShiftX = surfaceCenter.x - apex.x;
    cue.x = surfaceCenter.x;
    for (const rackBall of rack) {
        rackBall.x += rackShiftX;
    }
    return {
        positions: corrected,
        surfaceCenterX: surfaceCenter.x,
        apexBallNumber: apexRackIndex + 1,
        cueShiftX,
        rackShiftX,
        correctedCueX: cue.x,
        correctedApexX: rack[apexRackIndex].x
    };
}
function normalizeInitialRackPacking(alignedPositions) {
    if (alignedPositions.length !== 16) {
        return {
            positions: alignedPositions.map(p => p.clone()),
            spacing: 2 * BALL.RADIUS + RACK.BALL_GAP,
            maxCorrection: 0
        };
    }
    const corrected = alignedPositions.map(position => position.clone());
    const cue = corrected[0];
    const rackEntries = corrected.slice(1).map((position, index) => ({
        position,
        index
    }));
    const rackCenter = rackEntries.reduce((sum, entry) => sum.add(entry.position), new THREE.Vector3()).multiplyScalar(1 / rackEntries.length);
    const forward = rackCenter.clone().sub(cue);
    forward.y = 0;
    if (forward.lengthSq() < 1e-10) {
        forward.set(0, 0, -1);
    }
    else {
        forward.normalize();
    }
    const lateral = new THREE.Vector3(-forward.z, 0, forward.x);
    for (const entry of rackEntries) {
        const relative = entry.position.clone().sub(cue);
        entry.longitudinal = relative.dot(forward);
        entry.lateral = relative.dot(lateral);
    }
    rackEntries.sort((a, b) => a.longitudinal - b.longitudinal);
    const apex = rackEntries[0].position.clone();
    const spacing = 2 * BALL.RADIUS + RACK.BALL_GAP;
    const rowStep = spacing * Math.sqrt(3) / 2;
    let cursor = 0;
    let maxCorrection = 0;
    for (let row = 0; row < 5; row += 1) {
        const count = row + 1;
        const entries = rackEntries.slice(cursor, cursor + count);
        entries.sort((a, b) => a.lateral - b.lateral);
        for (let column = 0; column < count; column += 1) {
            const lateralOffset = (column - row / 2) * spacing;
            const target = apex.clone().addScaledVector(forward, row * rowStep).addScaledVector(lateral, lateralOffset);
            target.y = entries[column].position.y;
            maxCorrection = Math.max(maxCorrection, target.distanceTo(entries[column].position));
            corrected[entries[column].index + 1].copy(target);
        }
        cursor += count;
    }
    return {
        positions: corrected,
        spacing,
        maxCorrection
    };
}
function buildKitchenRegion(playingSurfaceBox, cueStart, objectStarts) {
    const extentX = playingSurfaceBox.max.x - playingSurfaceBox.min.x;
    const extentZ = playingSurfaceBox.max.z - playingSurfaceBox.min.z;
    const axis = extentX >= extentZ ? "x" : "z";
    const length = playingSurfaceBox.max[axis] - playingSurfaceBox.min[axis];
    const rackAverage = objectStarts.reduce((sum, position) => sum + position[axis], 0) / Math.max(1, objectStarts.length);
    const headPositive = cueStart[axis] > rackAverage;
    const headString = headPositive ? playingSurfaceBox.max[axis] - length * 0.25 : playingSurfaceBox.min[axis] + length * 0.25;
    return {
        axis,
        headPositive,
        headString
    };
}
function findFreeRespotPosition(desired, ball, balls, playingSurfaceBox) {
    const extentX = playingSurfaceBox.max.x - playingSurfaceBox.min.x;
    const extentZ = playingSurfaceBox.max.z - playingSurfaceBox.min.z;
    const axis = extentX >= extentZ ? "x" : "z";
    const min = playingSurfaceBox.min[axis] + ball.radius;
    const max = playingSurfaceBox.max[axis] - ball.radius;
    const spacing = ball.radius * 2 + 0.001;
    const candidate = desired.clone();
    const free = position => {
        for (const other of balls) {
            if (other === ball || other.pocketCommitted || other.state === BallState.FALLEN || other.state === BallState.COLLECTED) {
                continue;
            }
            const dx = position.x - other.position.x;
            const dz = position.z - other.position.z;
            const minimum = ball.radius + other.radius + 0.0008;
            if (dx * dx + dz * dz < minimum * minimum) {
                return false;
            }
        }
        return true;
    };
    if (free(candidate)) {
        return candidate;
    }
    for (let step = 1; step <= 32; step += 1) {
        for (const sign of [1, -1]) {
            candidate.copy(desired);
            candidate[axis] = THREE.MathUtils.clamp(desired[axis] + sign * step * spacing, min, max);
            if (free(candidate)) {
                return candidate.clone();
            }
        }
    }
    return desired.clone();
}

//INITIALIZATION
async function init() {
    audioManager = new AudioManager();
    const audioPreloadPromise = audioManager.preload();
    const startScreen = new StartScreen({
        audioManager
    });
    let skipIntroRequested = new URLSearchParams(window.location.search).get("skipIntro") === "1";
    const requestIntroSkip = event => {
        if (event.key !== "F8") {
            return;
        }
        skipIntroRequested = true;
        console.info("[INTRO] Skip armed: gameplay will start directly at the table.");
        event.preventDefault();
    };
    window.addEventListener("keydown", requestIntroSkip);
    const selectionPromise = startScreen.chooseGame();
    status.style.display = "none";
    try {
        const assets = await new BilliardsAssets(sceneManager.renderer).load();
        await audioPreloadPromise;
        sceneManager.scene.add(assets.root);
        const { clothY, tableSize, surfaceSize, scale } = assets.metrics;
        clothYGlobal = clothY;
        playingSurfaceBoxGlobal = assets.metrics.surfaceBox.clone();
        pubEnvironment = await new PubEnvironment(sceneManager.renderer, assets).load();
        sceneManager.scene.add(pubEnvironment.root);
        new LightingSystem(sceneManager.scene, clothY, {
            poolLightAnchors: pubEnvironment.getPoolLightAnchors()
        });
        tuneStaticPubLighting(sceneManager.scene);
        scoreboardSystem = new ScoreboardSystem({
            scene: sceneManager.scene,
            scoreboardObject: pubEnvironment.getScoreboardObject(),
            introWriteTimings: {
                line: audioManager.getDuration("chalkShort"),
                left: audioManager.getDuration("chalkLong"),
                right: audioManager.getDuration("chalkLong")
            }
        });
        playingSurfaceSystem = new PlayingSurfaceSystem(assets.get("PlayingSurface"));
        pocketSystem = new PocketSystem({
            pocketObjects: assets.getPockets(),
            clothY,
            eventSink: recordMatchPhysicsEvent
        });
        railCollisionSystem = new RailCollisionSystem({
            railObjects: assets.getRails(),
            playingSurfaceBox: assets.metrics.surfaceBox,
            clothY,
            eventSink: recordMatchPhysicsEvent
        });
        ballReturnCollisionSystem = new BallReturnCollisionSystem({
            ballReturnObject: assets.getBallReturn(),
            pocketSystem
        });
        pocketCaptureSystem = new PocketCaptureSystem({
            pocketSystem,
            clothY
        });
        physicsWorld = new PhysicsWorld({
            playingSurfaceSystem,
            railCollisionSystem,
            pocketSystem,
            pocketCaptureSystem,
            ballReturnCollisionSystem,
            clothY,
            eventSink: recordMatchPhysicsEvent
        });
        const importedBallStartPositions = assets.getBallStartPositions();
        const breakAlignment = alignInitialBreakAxis(importedBallStartPositions, assets.metrics.surfaceBox);
        const alignedBallStartPositions = breakAlignment.positions;
        cueBallStartPosition = alignedBallStartPositions[0].clone();
        cueBallStartPosition.y = clothY + BALL.RADIUS;
        cueBallBody = new RigidBall({
            position: cueBallStartPosition,
            radius: BALL.RADIUS,
            mass: BALL.MASS,
            label: "Cue ball"
        });
        resetBody(cueBallBody, cueBallStartPosition, BALL.INITIAL_YAW_DEG);
        physicsWorld.addBall(cueBallBody);
        cueBall = new CueBall(assets.clonePrototype("Ball_00_Cue"), cueBallBody);
        sceneManager.scene.add(cueBall);
        objectBallStartPositions = alignedBallStartPositions.slice(1).map(position => {
            const start = position.clone();
            start.y = clothY + BALL.RADIUS;
            return start;
        });
        objectBallBodies = objectBallStartPositions.map((position, index) => {
            const assetName = BALL_ASSET_NAMES[index + 1];
            const logicalNumber = getBallNumberForAsset(assetName);
            if (!Number.isInteger(logicalNumber) || logicalNumber <= 0) {
                throw new Error(`Missing logical pool-ball mapping for ${assetName}.`);
            }
            const body = new RigidBall({
                position,
                radius: BALL.RADIUS,
                mass: BALL.MASS,
                label: makeLogicalBallLabel(logicalNumber)
            });
            body.userData = {
                assetName,
                logicalNumber
            };
            resetBody(body, position, 0);
            physicsWorld.addBall(body);
            return body;
        });
        objectBallVisuals = objectBallBodies.map(body => {
            const assetName = body.userData?.assetName;
            const visual = new BilliardBall(assets.clonePrototype(assetName), body, {
                name: body.label
            });
            visual.userData.assetName = assetName;
            visual.userData.logicalNumber = body.userData?.logicalNumber;
            sceneManager.scene.add(visual);
            return visual;
        });
        const triangleVfxModel = assets.clonePrototype("Rack");
        triangleVfxModel.scale.multiplyScalar(scale);
        triangleAnimationSystem = new TriangleAnimationSystem({
            scene: sceneManager.scene,
            triangleObject: triangleVfxModel,
            cueBallVisual: cueBall,
            cueBallBody,
            objectBallBodies,
            cueBallStartPosition,
            objectBallStartPositions,
            clothY,
            ballRadius: BALL.RADIUS,
            finalizeRackReset: resetObjectRackForRebreak,
            finalizeCueRelease: finalizeCueBallRelease,
            audioManager
        });
        tableEffectsManager = new TableEffectsManager({
            scene: sceneManager.scene,
            pocketSystem,
            pocketObjects: assets.getPockets(),
            clothY,
            pocketFlashDuration: audioManager.getDuration("pocketMagic"),
            audioManager
        });
        cueRig = new CueRig(assets.clonePrototype("Cue"));
        cueRig.position.copy(cueBallBody.position);
        sceneManager.scene.add(cueRig);
        clearanceSystem = new CueClearanceSystem(cueRig, assets.getRails());
        for (const objectBall of objectBallVisuals) {
            clearanceSystem.addSphereObstacle(objectBall, BALL.RADIUS);
        }
        cueImpactSystem = new CueImpactSystem();
        shotSystem = new ShotSystem({
            cueRig,
            cueBallBody,
            cueImpactSystem,
            clearanceSystem
        });
        gameSelection = await selectionPromise;
        const soloMode = gameSelection.mode === StartMode.SOLO;
        matchController = new MatchController({
            ruleMode: soloMode ? RuleMode.SOLO_RUNOUT : RuleMode.TWO_PLAYER,
            playerNames: [
                "Marzius",
                "KILL"
            ]
        });
        soloChallenge = soloMode ? new SoloChallenge(gameSelection.difficulty) : null;
        scoreboardSystem.setMode(gameSelection.mode);
        kitchenRegion = buildKitchenRegion(assets.metrics.surfaceBox, cueBallStartPosition, objectBallStartPositions);
        ballInHandSystem = new BallInHandSystem({
            camera: sceneManager.camera,
            canvas: sceneManager.renderer.domElement,
            controls: sceneManager.controls,
            scene: sceneManager.scene,
            playingSurfaceSystem,
            playingSurfaceBox: assets.metrics.surfaceBox,
            pocketSystem,
            cueBallBody,
            objectBallBodies,
            clothY,
            kitchen: kitchenRegion
        });
        installBallInHandSnapAssist();
        trajectoryPreviewSystem = new TrajectoryPreviewSystem({
            scene: sceneManager.scene,
            cueRig,
            shotSystem,
            cueBallBody,
            objectBallBodies,
            playingSurfaceSystem,
            railObjects: assets.getRails(),
            pocketObjects: assets.getPockets(),
            playingSurfaceBox: assets.metrics.surfaceBox,
            clothY
        });
        inputManager = new InputManager();
        const botShotSimulator = new BotShotSimulator({
            playingSurfaceSystem,
            railObjects: assets.getRails(),
            pocketObjects: assets.getPockets(),
            playingSurfaceBox: assets.metrics.surfaceBox,
            clothY
        });
        botPlanner = new BotPlanner({
            cueRig,
            shotSystem,
            clearanceSystem,
            trajectoryPreviewSystem,
            cueBallBody,
            objectBallBodies,
            pocketSystem,
            playingSurfaceBox: assets.metrics.surfaceBox,
            matchController,
            ballInHandSystem,
            simulator: botShotSimulator
        });
        botPlanner.setDifficulty(gameSelection.difficulty);
        cpuPlayerController = new CpuPlayerController({
            matchController,
            botPlanner,
            ballInHandSystem,
            shotSystem,
            cueRig,
            clearanceSystem,
            trajectoryPreviewSystem,
            cueBallBody,
            objectBallBodies,
            pocketSystem,
            playingSurfaceBox: assets.metrics.surfaceBox,
            cueBallStartPosition
        });
        cpuPlayerController.setShotSetupListener(setup => {
            lastKillShotSetup = cloneKillShotSetup(setup);
            const plannerState = botPlanner.getState?.();
            console.groupCollapsed("[KILL-SHOT] captured for human replay");
            console.log("setup", lastKillShotSetup);
            console.log("planner best", plannerState?.best ?? null);
            console.log("planner execution", plannerState?.execution ?? null);
            console.groupEnd();
        });
        const resetTable = ({ skipOpeningBallInHand = false } = {}) => {
            if (endMatchCinematic?.isActive?.()) {
                endMatchCinematic.reset();
            }
            botPlanner?.cancel();
            cpuPlayerController?.reset();
            triangleAnimationSystem?.cancel?.();
            activePhysicsShotDiagnostic = null;
            resetEightPocketSelectionState();
            tableEffectsManager?.clearPocketMemory?.();
            tableEffectsManager?.deactivateBeacon?.();
            resetBody(cueBallBody, cueBallStartPosition, BALL.INITIAL_YAW_DEG);
            for (let i = 0; i < objectBallBodies.length; i += 1) {
                resetBody(objectBallBodies[i], objectBallStartPositions[i], 0);
            }
            accumulator = 0;
            nextShotSettledTime = 0;
            physicsWorld.resetCollisionStats();
            shotSystem.reset();
            matchController.reset();
            soloChallenge?.reset();
            ballInHandSystem.cancel();
            activeHumanBallInHandMode = null;
            activeHumanBallInHandPreferredPosition = null;
            pendingCueReleasePlacement = null;
            triangleAnimationSystem?.setCuePreviewOpacity?.(1);
            syncScoreboard();
            cueRig.setYawDeg(CUE_RIG.DEFAULT_YAW_DEG);
            cueRig.setElevationDeg(CUE_RIG.DEFAULT_ELEVATION_DEG);
            trajectoryPreviewSystem?.invalidate();
            cueBall.syncFromPhysics();
            for (const visual of objectBallVisuals) {
                visual.syncFromPhysics();
            }
            cueRig.position.copy(cueBallBody.position);
            clearanceSystem.update(true);
            if (!skipOpeningBallInHand && startBallInHand) {
                startBallInHand(BallInHandMode.KITCHEN, cueBallStartPosition);
            }
        };
        const dropTest = () => {
            resetTable();
            cueBallBody.position.y += 0.10;
        };
        const finishConfirmedBallInHand = (topDownPoseBeforeConfirm, source = "ui") => {
            matchController.completeBallInHand();
            activeHumanBallInHandMode = null;
            activeHumanBallInHandPreferredPosition = null;
            pendingCueReleasePlacement = null;
            triangleAnimationSystem?.setCuePreviewOpacity?.(1);
            setCueBallPlacementShadowEnabled(true);
            shotSystem.rearmForNextShot();
            cueRig.visible = false;
            cueRig.position.copy(cueBallBody.position);
            clearanceSystem.update(true);
            trajectoryPreviewSystem.invalidate();
            if (playerGameplayController) {
                applyCameraPose(topDownPoseBeforeConfirm);
                const ruleStateAfterPlacement = matchController.getRuleState();
                if (ruleStateAfterPlacement.currentPlayer === 0 && ruleStateAfterPlacement.mustCallEightPocket && !ruleStateAfterPlacement.calledEightPocket) {
                    startHumanEightPocketSelection({
                        topDownPose: topDownPoseBeforeConfirm,
                        fromBallInHand: true
                    });
                }
                else {
                    playerGameplayController.afterBallInHandConfirmed(topDownPoseBeforeConfirm, {
                        suppressEnter: source === "keyboard"
                    });
                }
            }
        };
        const confirmBallInHand = (source = "ui") => {
            const topDownPoseBeforeConfirm = captureCameraPose();
            const releaseTarget = cueBallBody.position.clone();
            if (!ballInHandSystem.confirm()) {
                return false;
            }
            setCueBallPlacementShadowEnabled(true);
            if (pendingCueReleasePlacement?.player === 0) {
                applyCameraPose(topDownPoseBeforeConfirm);
                triangleAnimationSystem?.setCuePreviewOpacity?.(0);
                const started = triangleAnimationSystem?.startSequence([{
                        type: TriangleAnimation.CUE_RELEASE,
                        targetPosition: releaseTarget
                    }], {
                    onComplete: () => {
                        finishConfirmedBallInHand(topDownPoseBeforeConfirm, source);
                    }
                });
                if (started) {
                    return true;
                }
                finalizeCueBallRelease(releaseTarget);
            }
            finishConfirmedBallInHand(topDownPoseBeforeConfirm, source);
            return true;
        };
        uiManager = new UIManager({
            cueRig,
            clearanceSystem,
            shotSystem,
            cueImpactSystem,
            scene: sceneManager.scene,
            cueBallBody,
            objectBallBodies,
            physicsWorld,
            railCollisionSystem,
            pocketSystem,
            pocketCaptureSystem,
            ballReturnCollisionSystem,
            trajectoryPreviewSystem,
            matchController,
            ballInHandSystem,
            botPlanner,
            cpuPlayerController,
            confirmBallInHand,
            resetTable,
            dropTest,
            gameMode: gameSelection.mode
        });
        uiManager.setVisible(false);
        let debugPanelVisible = false;
        window.addEventListener("keydown", event => {
            if (event.key !== "F2" || event.repeat) {
                return;
            }
            debugPanelVisible = !debugPanelVisible;
            uiManager.setVisible(debugPanelVisible);
            event.preventDefault();
        });
        sceneManager.frameObject(assets.get("PoolTable"), clothY);
        const gameplayCameraPose = captureCameraPose();
        ballInHandSystem.begin({
            preferredPosition: cueBallStartPosition,
            mode: BallInHandMode.KITCHEN
        });
        const openingTopDownPose = captureCameraPose();
        ballInHandSystem.cancel();
        applyCameraPose(gameplayCameraPose);
        cueRig.visible = false;
        const introSequence = new IntroSequence({
            camera: sceneManager.camera,
            controls: sceneManager.controls,
            pubEnvironment,
            scoreboardSystem,
            topDownPose: openingTopDownPose,
            tableBox: assets.metrics.tableBox,
            kitchenPoint: cueBallStartPosition,
            audioManager
        });
        introSequence.prepareBlack();
        await startScreen.showStory(gameSelection.mode);
        await startScreen.fadeOut();
        if (skipIntroRequested) {
            introSequence.skipToTable();
        }
        else {
            await introSequence.play();
        }
        audioManager.startJukebox(pubEnvironment.getJukeboxWorldPosition?.(), { fadeIn: 1.0 });
        window.removeEventListener("keydown", requestIntroSkip);
        const preBevPose = introSequence.getPreBevPose() ?? gameplayCameraPose;
        applyCameraPose(preBevPose);
        cpuCueAnimator = new CpuCueAnimator({
            cueRig,
            shotSystem,
            audioManager
        });
        cpuPlayerController.setShotExecutor(() => cpuCueAnimator.start(), () => cpuCueAnimator.isBusy());
        gameplayHud = new GameplayHUD();
        playerGameplayController = new PlayerGameplayController({
            camera: sceneManager.camera,
            canvas: sceneManager.renderer.domElement,
            controls: sceneManager.controls,
            pubEnvironment,
            cueRig,
            shotSystem,
            clearanceSystem,
            trajectoryPreviewSystem,
            cueBallBody,
            tableBox: assets.metrics.tableBox,
            kitchenRegion,
            topDownPose: openingTopDownPose,
            matchController,
            ballInHandSystem,
            cpuCueAnimator,
            hud: gameplayHud,
            initialPose: preBevPose,
            audioManager
        });
        cpuPlayerController?.setPlayerGameplayController(playerGameplayController);
        endMatchCinematic = new EndMatchCinematicController({
            scene: sceneManager.scene,
            camera: sceneManager.camera,
            pubEnvironment,
            scoreboardSystem,
            playerGameplayController,
            cpuCueAnimator,
            cueRig,
            gameplayHud,
            tableCenter: assets.metrics.tableBox.getCenter(new THREE.Vector3()),
            tableBox: assets.metrics.tableBox,
            debugStatusElement: status,
            onRematch: () => {
                vfxTestModeActive = false;
                playerGameplayController?.initializeFromPose?.(preBevPose);
                resetTable();
                syncScoreboard();
            },
            onMainMenu: () => {
                window.location.reload();
            },
            audioManager
        });
        pauseMenu = new PauseMenu({
            mode: gameSelection.mode,
            canPause: () => gameplayReady,
            onPauseChange: setGamePaused,
            onRestart: () => {
                vfxTestModeActive = false;
                playerGameplayController?.initializeFromPose?.(preBevPose);
                resetTable();
                syncScoreboard();
            },
            onMainMenu: () => {
                window.location.reload();
            },
            audioManager
        });
        installSelectorEvents();
        installPhysicsDiagnosticControls();
        vfxTestHarness = new VfxTestHarness({
            triangleAnimationSystem,
            tableEffectsManager,
            camera: sceneManager.camera,
            cueBallBody,
            objectBallBodies,
            cueBallStartPosition,
            objectBallStartPositions,
            clothY,
            ballRadius: BALL.RADIUS,
            resetScene: ({ resumeGameplay = false } = {}) => {
                resetTable({
                    skipOpeningBallInHand: !resumeGameplay
                });
                if (!resumeGameplay) {
                    playerGameplayController?.beforeBallInHand?.();
                }
            },
            syncVisuals: () => {
                cueBall.syncFromPhysics();
                for (const visual of objectBallVisuals) {
                    visual.syncFromPhysics();
                }
            },
            setTestModeActive: active => {
                vfxTestModeActive = !!active;
                if (vfxTestModeActive) {
                    gameplayHud?.hideKillThinking?.();
                }
            },
            beginPlayerEightSelection: startPlayerEightPocketSelectionTest,
            beginKillEightSelection: startKillEightPocketSelectionTest,
            endEightSelection: endEightPocketSelectionTest,
            beginVictoryCinematic: () => {
                endMatchCinematic?.start?.(EndMatchResult.VICTORY, { reason: "VFX_TEST" });
            },
            beginDefeatCinematic: () => {
                endMatchCinematic?.start?.(EndMatchResult.DEFEAT, { reason: "VFX_TEST" });
            },
            resetEndCinematic: () => {
                endMatchCinematic?.reset?.();
            },
            setHudMessage: message => {
                gameplayHud?.setState?.(`VFX TEST · ${message}`);
            }
        });
        console.info("[VFX-TEST] F9 toggles the automated VFX scenario harness.");
        if (!skipIntroRequested) {
            startBallInHand(BallInHandMode.KITCHEN, cueBallStartPosition);
        }
        else {
            const fastStartPose = captureCameraPose();
            ballInHandSystem.begin({
                preferredPosition: cueBallStartPosition,
                mode: BallInHandMode.KITCHEN
            });
            matchController.beginBallInHand();
            const placementConfirmed = ballInHandSystem.confirm();
            const matchConfirmed = placementConfirmed ? matchController.completeBallInHand() : false;
            applyCameraPose(fastStartPose);
            if (!placementConfirmed || !matchConfirmed) {
                console.warn("[INTRO] Fast-start BIH bootstrap failed; falling back to the normal opening placement.");
                startBallInHand(BallInHandMode.KITCHEN, cueBallStartPosition);
            }
            else {
                shotSystem.rearmForNextShot();
                cueRig.visible = false;
                cueRig.position.copy(cueBallBody.position);
                clearanceSystem.update(true);
                trajectoryPreviewSystem.invalidate();
            }
        }
        syncScoreboard();
        gameplayReady = true;
        uiManager.setVisible(false);
        introSequence.dispose();
        status.style.display = "block";
        console.info("Billiards v0.18.4 loaded.");
        console.info("Physics fixed dt:", PHYSICS.FIXED_DT);
        console.info("Uniform asset scale:", scale);
        console.info("PoolTable size:", tableSize);
        console.info("PlayingSurface size:", surfaceSize);
        console.info("Visual foundation:", "pub room + imported props + real pool light");
        console.info("Object balls:", objectBallBodies.length);
        console.info("Ball visual assets:", BALL_ASSET_NAMES);
        console.info("Cue-ball aligned start:", cueBallStartPosition);
        console.info("Aligned object-ball starts:", objectBallStartPositions);
        console.info("Break-axis alignment:", {
            surfaceCenterX: breakAlignment.surfaceCenterX,
            apexBallNumber: breakAlignment.apexBallNumber,
            cueShiftX: breakAlignment.cueShiftX,
            rackShiftX: breakAlignment.rackShiftX,
            correctedCueX: breakAlignment.correctedCueX,
            correctedApexX: breakAlignment.correctedApexX
        });
        console.info("Pocket assets:", assets.getPockets().map(pocket => pocket.name));
        console.info("PhysicsWorld:", physicsWorld);
        status.textContent = "v0.18.4 — code cleanup and refactor";
        status.classList.add("ready");
    }
    catch (error) {
        console.error(error);
        status.style.display = "block";
        status.textContent = "Asset loading failed. The bundled GLB must contain Ball_00_Cue..Ball_15 and Pocket_* objects.";
        status.classList.add("error");
    }
}

//SIMULATION
//Advance physics with the fixed-step accumulator while limiting catch-up work per frame.
function physicsUpdate(frameDt) {
    accumulator += frameDt;
    let substeps = 0;
    while (accumulator >= PHYSICS.FIXED_DT && substeps < PHYSICS.MAX_SUBSTEPS) {
        probePhysicsShotDiagnosticBeforeStep(PHYSICS.FIXED_DT);
        physicsWorld.step(PHYSICS.FIXED_DT);
        probePhysicsShotDiagnosticAfterStep();
        accumulator -= PHYSICS.FIXED_DT;
        substeps += 1;
    }
    if (substeps >= PHYSICS.MAX_SUBSTEPS) {
        accumulator = 0;
    }
}

//HUD
function syncKillThinkingHud() {
    if (!gameplayHud || !cpuPlayerController || !botPlanner || endMatchCinematic?.isActive?.() || !cpuPlayerController.isCpuTurn()) {
        gameplayHud?.hideKillThinking();
        return;
    }
    const cpuState = cpuPlayerController.getState();
    const plannerState = botPlanner.getState();
    if (cpuState.state === CpuTurnState.PLANNING) {
        const total = Math.max(0, plannerState.total ?? 0);
        const tested = Math.max(0, plannerState.tested ?? 0);
        gameplayHud.showKillThinking({
            label: total > 0 ? `Evaluating physical trajectories ${tested}/${total}` : "Searching for legal routes…",
            progress: total > 0 ? tested / total : null,
            indeterminate: total <= 0
        });
        return;
    }
    if (cpuState.state === CpuTurnState.AIMED) {
        gameplayHud.showKillThinking({
            label: "Shot selected. KILL is preparing to manifest the cue…",
            progress: 1
        });
        return;
    }
    if (cpuState.state === CpuTurnState.SHOOTING) {
        const animation = cpuCueAnimator?.getState();
        const phase = animation?.phase;
        if (phase === CpuCueAnimationPhase.IDLE && shotSystem?.hasCommittedShot()) {
            gameplayHud.hideKillThinking();
            return;
        }
        let label = "KILL is executing the shot…";
        let progress = animation?.progress ?? 1;
        if (phase === CpuCueAnimationPhase.FADE_IN) {
            label = "The ghost cue is taking shape…";
        }
        else if (phase === CpuCueAnimationPhase.CHARGE) {
            label = "KILL is loading the stroke…";
        }
        else if (phase === CpuCueAnimationPhase.STRIKE) {
            label = "KILL shoots.";
            progress = 1;
        }
        else if (phase === CpuCueAnimationPhase.FADE_OUT) {
            label = "The ghost cue fades away…";
        }
        gameplayHud.showKillThinking({
            label,
            progress
        });
        return;
    }
    if (cpuState.state === CpuTurnState.ERROR) {
        gameplayHud.showKillThinking({
            label: cpuState.message || "KILL's planning failed.",
            progress: 0
        });
        return;
    }
    gameplayHud.showKillThinking({
        label: "KILL studies the table…",
        progress: null,
        indeterminate: true
    });
}

//MAIN LOOP
//Keep rendering alive during pause, but skip every time-dependent gameplay update.
function animate() {
    requestAnimationFrame(animate);
    const frameDt = Math.min(clock.getDelta(), PHYSICS.MAX_FRAME_DT);
    if (gamePaused) {
        sceneManager.render();
        return;
    }
    if (cueRig) {
        const endCinematicActive = endMatchCinematic?.isActive?.() ?? false;
        if (gameplayReady) {
            if (!endCinematicActive) {
                playerGameplayController?.update(frameDt);
            }
            if (!vfxTestModeActive || endCinematicActive) {
                cpuCueAnimator?.update(frameDt);
            }
        }
        endMatchCinematic?.update(frameDt);
        cueRig.update(frameDt);
        const committedBeforeUpdate = shotSystem.hasCommittedShot();
        if (!vfxTestModeActive) {
            shotSystem.update();
        }
        if (!vfxTestModeActive && !committedBeforeUpdate && shotSystem.hasCommittedShot()) {
            const impact = shotSystem.getLastImpact();
            audioManager?.play?.("cueStrike", {
                position: cueBallBody.position,
                gain: 0.34 + THREE.MathUtils.clamp(impact?.power ?? shotSystem.getPower(), 0, 1) * 0.52,
                rate: 0.985 + Math.random() * 0.03,
                refDistance: 0.72,
                maxDistance: 9.5,
                rolloffFactor: 1.12
            });
            beginPhysicsShotDiagnostic({
                source: "NORMAL ShotSystem / stroke path",
                power: shotSystem.getPower(),
                impact: impact
            });
            matchController.startShot({
                simulationTime: physicsWorld.simulationTime,
                impact: impact
            });
        }
        if (triangleAnimationSystem?.isBusy()) {
            triangleAnimationSystem.update(frameDt);
        }
        else if (!vfxTestModeActive) {
            physicsUpdate(frameDt);
        }
        vfxTestHarness?.update(frameDt);
        cueBall.syncFromPhysics();
        for (const visual of objectBallVisuals) {
            visual.syncFromPhysics();
        }
        if (!vfxTestModeActive && shotSystem.hasCommittedShot() && !cueRig.strokeActive && matchController.isShotActive()) {
            if (physicsWorld.areBallsSettled()) {
                nextShotSettledTime += frameDt;
                if (nextShotSettledTime >= TURN.REARM_SETTLED_TIME) {
                    const ruleStateBefore = matchController.getRuleState();
                    const shotResult = matchController.finishShot({
                        simulationTime: physicsWorld.simulationTime,
                        balls: [
                            cueBallBody,
                            ...objectBallBodies
                        ]
                    });
                    nextShotSettledTime = 0;
                    let ruling = shotResult?.ruling;
                    applyRuleActions(ruling);
                    if (soloChallenge && ruling) {
                        const ruleStateAfter = matchController.getRuleState();
                        soloChallenge.recordShot({
                            ruling,
                            ruleStateBefore,
                            ruleStateAfter
                        });
                        if (!ruling.gameOver && soloChallenge.isLimitReached()) {
                            ruling = matchController.forceSoloLoss("SOLO_MOVE_LIMIT") ?? ruling;
                        }
                    }
                    syncScoreboard();
                    continueAfterRuling(ruling);
                }
            }
            else {
                nextShotSettledTime = 0;
            }
        }
        else {
            nextShotSettledTime = 0;
        }
        if (gameplayReady) {
            if (!vfxTestModeActive && !endCinematicActive && !(triangleAnimationSystem?.isBusy() ?? false)) {
                cpuPlayerController?.update(frameDt);
            }
            if (!vfxTestModeActive) {
                syncKillThinkingHud();
            }
        }
        if (!shotSystem.strokeStarted && !(ballInHandSystem?.isActive() ?? false)) {
            cueRig.position.copy(cueBallBody.position);
        }
        if (!shotSystem.hasCommittedShot()) {
            clearanceSystem.update();
        }
        if (gameplayReady) {
            trajectoryPreviewSystem.update(performance.now() / 1000);
            syncScoreboard();
            maybeStartHumanEightPocketSelection();
            if (!vfxTestModeActive) {
                syncCalledPocketBeacon();
                tableEffectsManager?.scanPocketCommit(cueBallBody, resolvePocketFlashColor);
                for (const body of objectBallBodies) {
                    tableEffectsManager?.scanPocketCommit(body, resolvePocketFlashColor);
                }
            }
            tableEffectsManager?.update(frameDt);
            uiManager.sync();
        }
    }
    pubEnvironment?.setTopDownOcclusion((ballInHandSystem?.isActive() ?? false) || (playerGameplayController?.isTopDownViewActive() ?? false) || (eightPocketSelectionState?.active ?? false));
    audioManager?.updateListener?.(sceneManager.camera);
    sceneManager.render();
}
init();
animate();
