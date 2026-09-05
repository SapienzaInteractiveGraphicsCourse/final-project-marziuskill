//DEPENDENCIES
import * as THREE from "three";
import { TriangleAnimation } from "./TriangleAnimationSystem.js";
import { TABLE_EFFECT_COLORS } from "./TableEffectsManager.js";

//TEST CONFIGURATION
const Actor = Object.freeze({
    PLAYER: "PLAYER",
    KILL: "KILL"
});
const Scenario = Object.freeze({
    BREAK_INTACT: "BREAK_INTACT",
    BREAK_MOVED: "BREAK_MOVED",
    SCRATCH: "SCRATCH",
    FOUL_BIH: "FOUL_BIH",
    POCKET_ALLY: "POCKET_ALLY",
    POCKET_ENEMY: "POCKET_ENEMY",
    EIGHT_CALL: "EIGHT_CALL",
    END_VICTORY: "END_VICTORY",
    END_DEFEAT: "END_DEFEAT"
});

//HELPERS
function parseBallNumber(label) {
    const match = /^Ball\s+(\d+)$/.exec(String(label ?? "").trim());
    return match ? Number(match[1]) : null;
}
function smootherstep01(value) {
    const x = THREE.MathUtils.clamp(value, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

//VFX TEST HARNESS
export class VfxTestHarness {
    constructor({ triangleAnimationSystem, tableEffectsManager, camera = null, cueBallBody, objectBallBodies, cueBallStartPosition, objectBallStartPositions, clothY, ballRadius, resetScene, syncVisuals, setTestModeActive, beginPlayerEightSelection, beginKillEightSelection, endEightSelection, beginVictoryCinematic = null, beginDefeatCinematic = null, resetEndCinematic = null, setHudMessage = null }) {
        this.triangleAnimationSystem = triangleAnimationSystem;
        this.tableEffectsManager = tableEffectsManager;
        this.camera = camera;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.cueBallStartPosition = cueBallStartPosition.clone();
        this.objectBallStartPositions = objectBallStartPositions.map(p => p.clone());
        this.clothY = clothY;
        this.ballRadius = ballRadius;
        this.resetScene = resetScene;
        this.syncVisuals = syncVisuals;
        this.setTestModeActive = setTestModeActive;
        this.beginPlayerEightSelection = beginPlayerEightSelection;
        this.beginKillEightSelection = beginKillEightSelection;
        this.endEightSelection = endEightSelection;
        this.beginVictoryCinematic = beginVictoryCinematic;
        this.beginDefeatCinematic = beginDefeatCinematic;
        this.resetEndCinematic = resetEndCinematic;
        this.setHudMessage = setHudMessage;
        this.visible = false;
        this.active = false;
        this.pending = [];
        this.elapsed = 0;
        this.pocketTween = null;
        this.panel = this.#buildPanel();
        document.body.appendChild(this.panel);
        this._onKeyDown = this.#onKeyDown.bind(this);
        window.addEventListener("keydown", this._onKeyDown);
    }
    #buildPanel() {
        const panel = document.createElement("div");
        panel.id = "vfx-test-harness";
        Object.assign(panel.style, {
            position: "fixed",
            top: "18px",
            right: "18px",
            zIndex: "10000",
            width: "320px",
            padding: "14px",
            borderRadius: "10px",
            border: "1px solid rgba(110,220,255,.55)",
            background: "rgba(5,12,18,.94)",
            color: "#e8f7ff",
            font: "13px/1.35 system-ui, sans-serif",
            boxShadow: "0 10px 32px rgba(0,0,0,.45)",
            display: "none"
        });
        panel.innerHTML = `
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">VFX test harness · F9</div>
      <label style="display:block;margin-bottom:8px">Actor
        <select data-role="actor" style="width:100%;margin-top:4px;background:#101b24;color:#fff;border:1px solid #365367;padding:6px">
          <option value="PLAYER">PLAYER</option>
          <option value="KILL">KILL</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:10px">Scenario
        <select data-role="scenario" style="width:100%;margin-top:4px;background:#101b24;color:#fff;border:1px solid #365367;padding:6px">
          <option value="BREAK_INTACT">Illegal break · rack intact · 2 → 3</option>
          <option value="BREAK_MOVED">Illegal break · rack moved · 1 → 2 → 3</option>
          <option value="SCRATCH">Scratch · yellow pocket VFX → 3</option>
          <option value="FOUL_BIH">Other foul / BIH · 2 → 3</option>
          <option value="POCKET_ALLY">Pocket allied group · blue</option>
          <option value="POCKET_ENEMY">Pocket enemy group · red</option>
          <option value="EIGHT_CALL">Last group ball → 8-pocket call / beacon</option>
          <option value="END_VICTORY">End match · Victory cinematic</option>
          <option value="END_DEFEAT">End match · Defeat cinematic</option>
        </select>
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
        <button data-role="run">Run scenario</button>
        <button data-role="end-turn">End turn</button>
        <button data-role="reset">Reset test</button>
        <button data-role="close">Close</button>
      </div>
      <div data-role="status" style="margin-top:10px;color:#9edfff;min-height:34px">Choose actor + scenario.</div>
      <div style="margin-top:8px;color:#7893a3;font-size:11px">For PLAYER 8-ball call: use WASD + Enter. Beacon remains until “End turn”.</div>
    `;
        for (const button of panel.querySelectorAll("button")) {
            Object.assign(button.style, {
                background: "#132837",
                color: "#eaf9ff",
                border: "1px solid #365d73",
                borderRadius: "6px",
                padding: "7px 6px",
                cursor: "pointer"
            });
        }
        panel.querySelector('[data-role="run"]').addEventListener("click", () => this.runSelected());
        panel.querySelector('[data-role="end-turn"]').addEventListener("click", () => this.endTurn());
        panel.querySelector('[data-role="reset"]').addEventListener("click", () => this.reset());
        panel.querySelector('[data-role="close"]').addEventListener("click", () => this.setVisible(false));
        return panel;
    }
    #onKeyDown(event) {
        if (event.key === "F9" && !event.repeat) {
            event.preventDefault();
            this.setVisible(!this.visible);
        }
    }
    setVisible(visible) {
        this.visible = !!visible;
        this.panel.style.display = this.visible ? "block" : "none";
    }
    #status(message) {
        this.panel.querySelector('[data-role="status"]').textContent = message;
        this.setHudMessage?.(message);
    }
    #actor() {
        return this.panel.querySelector('[data-role="actor"]').value;
    }
    #scenario() {
        return this.panel.querySelector('[data-role="scenario"]').value;
    }
    #schedule(delay, fn) {
        this.pending.push({ at: this.elapsed + delay, fn });
        this.pending.sort((a, b) => a.at - b.at);
    }
    #stopBody(body) {
        body.velocity?.set?.(0, 0, 0);
        body.angularVelocity?.set?.(0, 0, 0);
    }
    #bodyByNumber(number) {
        return this.objectBallBodies.find(body => parseBallNumber(body.label) === number) ?? null;
    }
    #pocketForTest(index = 0) {
        const pockets = this.tableEffectsManager.getPockets();
        return pockets.length ? pockets[index % pockets.length] : null;
    }
    #moveRackOutOfPlace() {
        for (let i = 0; i < Math.min(8, this.objectBallBodies.length); i += 1) {
            const body = this.objectBallBodies[i];
            const side = i % 2 === 0 ? 1 : -1;
            body.position.x += side * (0.045 + i * 0.006);
            body.position.z += 0.035 + (i % 3) * 0.022;
            this.#stopBody(body);
        }
    }
    #moveCueForRecovery() {
        this.cueBallBody.position.copy(this.cueBallStartPosition);
        this.cueBallBody.position.x += 0.22;
        this.cueBallBody.position.z += 0.16;
        this.cueBallBody.position.y = this.clothY + this.ballRadius;
        this.#stopBody(this.cueBallBody);
    }
    #startTriangle(steps, label) {
        const started = this.triangleAnimationSystem.startSequence(steps, {
            onComplete: () => {
                this.#status(`${label} complete.`);
                this.syncVisuals?.();
            }
        });
        if (!started) {
            this.#status("Triangle system is busy; reset and retry.");
        }
    }
    #animatePocket(body, pocket, color, { startPosition = null, duration = 0.46, approachFraction = 0, onComplete = null } = {}) {
        if (!body || !pocket) {
            this.#status("Pocket/body not available in this build.");
            return;
        }
        const start = startPosition?.clone?.() ?? body.position.clone();
        if (!startPosition) {
            start.x = pocket.center.x;
            start.z = pocket.center.z;
        }
        start.y = this.clothY + this.ballRadius;
        body.position.copy(start);
        this.#stopBody(body);
        this.pocketTween = {
            body,
            pocket,
            color,
            elapsed: 0,
            duration,
            approachFraction: THREE.MathUtils.clamp(approachFraction, 0, 0.9),
            flashed: false,
            start,
            onComplete
        };
    }
    #runEndMatchPocket(actor, result) {
        const pockets = this.tableEffectsManager.getPockets();
        const eight = this.#bodyByNumber(8) ?? this.objectBallBodies[0];
        const pocket = this.camera && pockets.length ? pockets.reduce((best, item) => {
            if (!best)
                return item;
            const a = item.center.distanceToSquared(this.camera.position);
            const b = best.center.distanceToSquared(this.camera.position);
            return a < b ? item : best;
        }, null) : (pockets[0] ?? null);
        if (!eight || !pocket || pockets.length === 0) {
            this.#status("End-match test prerequisites are missing.");
            return;
        }
        const tableCenter = pockets.reduce((sum, item) => sum.add(item.center), new THREE.Vector3()).multiplyScalar(1 / pockets.length);
        const shotDirection = pocket.center.clone().sub(tableCenter).setY(0);
        if (shotDirection.lengthSq() < 1e-8) {
            shotDirection.set(0, 0, 1);
        }
        else {
            shotDirection.normalize();
        }
        for (const body of this.objectBallBodies) {
            if (body === eight) {
                continue;
            }
            body.position.set(body.position.x, this.clothY - 3.0, body.position.z);
            this.#stopBody(body);
        }
        const eightStart = pocket.center.clone().addScaledVector(shotDirection, -0.34);
        eightStart.y = this.clothY + this.ballRadius;
        const cueStart = eightStart.clone().addScaledVector(shotDirection, -0.46);
        cueStart.y = this.clothY + this.ballRadius;
        eight.position.copy(eightStart);
        this.cueBallBody.position.copy(cueStart);
        this.#stopBody(eight);
        this.#stopBody(this.cueBallBody);
        this.syncVisuals?.();
        this.#status(`${actor}: final 8-ball is dropping · ${result.toLowerCase()} cinematic follows.`);
        this.#animatePocket(eight, pocket, actor === Actor.PLAYER ? TABLE_EFFECT_COLORS.ALLY : TABLE_EFFECT_COLORS.ENEMY, {
            startPosition: eightStart,
            duration: 0.92,
            approachFraction: 0.62,
            onComplete: () => {
                this.#schedule(0.92, () => {
                    if (result === Scenario.END_VICTORY) {
                        this.beginVictoryCinematic?.();
                    }
                    else {
                        this.beginDefeatCinematic?.();
                    }
                });
            }
        });
    }
    #runEightCall(actor) {
        const pocket = this.#pocketForTest(0);
        const eight = this.#bodyByNumber(8) ?? this.objectBallBodies[0];
        const lastGroupBall = actor === Actor.PLAYER ? (this.#bodyByNumber(1) ?? this.objectBallBodies[1]) : (this.#bodyByNumber(9) ?? this.objectBallBodies[1]);
        if (!pocket || !eight || !lastGroupBall) {
            this.#status("8-ball test prerequisites are missing.");
            return;
        }
        const pockets = this.tableEffectsManager.getPockets();
        const center = pockets.reduce((acc, item) => acc.add(item.center), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pockets.length));
        eight.position.set(center.x + 0.08, this.clothY + this.ballRadius, center.z - 0.05);
        this.#stopBody(eight);
        this.#status(`${actor}: last group ball is about to drop.`);
        this.#animatePocket(lastGroupBall, pocket, actor === Actor.PLAYER ? TABLE_EFFECT_COLORS.ALLY : TABLE_EFFECT_COLORS.ENEMY);
        this.#schedule(0.78, () => {
            if (actor === Actor.PLAYER) {
                this.#status("PLAYER: choose the 8 pocket with WASD, confirm with Enter.");
                this.beginPlayerEightSelection?.();
            }
            else {
                this.#status("KILL: automatic 8-pocket choice; red beacon must persist until End turn.");
                this.beginKillEightSelection?.();
            }
        });
    }
    runSelected() {
        const actor = this.#actor();
        const scenario = this.#scenario();
        this.pending = [];
        this.elapsed = 0;
        this.pocketTween = null;
        this.endEightSelection?.({ immediate: true });
        this.resetEndCinematic?.();
        this.triangleAnimationSystem.cancel();
        this.tableEffectsManager.clearSelection();
        this.tableEffectsManager.clearBeaconImmediately?.();
        this.resetScene?.({ resumeGameplay: false });
        this.setTestModeActive?.(true);
        this.active = true;
        if (scenario === Scenario.BREAK_INTACT) {
            this.#moveCueForRecovery();
            this.syncVisuals?.();
            this.#status(`${actor}: illegal break, rack intact · recover → release.`);
            this.#startTriangle([
                {
                    type: TriangleAnimation.CUE_RECOVER,
                    sourcePosition: this.cueBallBody.position.clone(),
                    targetPosition: this.cueBallStartPosition.clone()
                },
                {
                    type: TriangleAnimation.CUE_RELEASE,
                    targetPosition: this.cueBallStartPosition.clone()
                }
            ], `${actor} illegal-break intact`);
            return;
        }
        if (scenario === Scenario.BREAK_MOVED) {
            this.#moveRackOutOfPlace();
            this.#moveCueForRecovery();
            this.syncVisuals?.();
            this.#status(`${actor}: illegal break, moved rack · rack reset → recover → release.`);
            this.#startTriangle([
                { type: TriangleAnimation.RACK_RESET },
                {
                    type: TriangleAnimation.CUE_RECOVER,
                    sourcePosition: this.cueBallBody.position.clone(),
                    targetPosition: this.cueBallStartPosition.clone()
                },
                {
                    type: TriangleAnimation.CUE_RELEASE,
                    targetPosition: this.cueBallStartPosition.clone()
                }
            ], `${actor} illegal-break moved`);
            return;
        }
        if (scenario === Scenario.SCRATCH) {
            const pocket = this.#pocketForTest(0);
            this.#status(`${actor}: scratch · yellow pocket flash, then release only.`);
            this.#animatePocket(this.cueBallBody, pocket, TABLE_EFFECT_COLORS.WARNING);
            this.#schedule(0.62, () => {
                this.#startTriangle([
                    {
                        type: TriangleAnimation.CUE_RELEASE,
                        targetPosition: this.cueBallStartPosition.clone()
                    }
                ], `${actor} scratch`);
            });
            return;
        }
        if (scenario === Scenario.FOUL_BIH) {
            this.#moveCueForRecovery();
            this.syncVisuals?.();
            this.#status(`${actor}: generic foul · recover → release.`);
            this.#startTriangle([
                {
                    type: TriangleAnimation.CUE_RECOVER,
                    sourcePosition: this.cueBallBody.position.clone(),
                    targetPosition: this.cueBallStartPosition.clone()
                },
                {
                    type: TriangleAnimation.CUE_RELEASE,
                    targetPosition: this.cueBallStartPosition.clone()
                }
            ], `${actor} foul / BIH`);
            return;
        }
        if (scenario === Scenario.POCKET_ALLY) {
            this.#status(`${actor}: allied-group pocket · blue mouth flash.`);
            this.#animatePocket(this.#bodyByNumber(1) ?? this.objectBallBodies[0], this.#pocketForTest(1), TABLE_EFFECT_COLORS.ALLY);
            return;
        }
        if (scenario === Scenario.POCKET_ENEMY) {
            this.#status(`${actor}: enemy-group pocket · red mouth flash.`);
            this.#animatePocket(this.#bodyByNumber(9) ?? this.objectBallBodies[0], this.#pocketForTest(2), TABLE_EFFECT_COLORS.ENEMY);
            return;
        }
        if (scenario === Scenario.END_VICTORY) {
            this.setVisible(false);
            this.#runEndMatchPocket(Actor.PLAYER, Scenario.END_VICTORY);
            return;
        }
        if (scenario === Scenario.END_DEFEAT) {
            this.setVisible(false);
            this.#runEndMatchPocket(Actor.KILL, Scenario.END_DEFEAT);
            return;
        }
        if (scenario === Scenario.EIGHT_CALL) {
            this.#runEightCall(actor);
        }
    }
    endTurn() {
        this.tableEffectsManager.deactivateBeacon();
        this.endEightSelection?.({ immediate: false });
        this.#status("Simulated turn ended · beacon shutdown animation started.");
    }
    reset() {
        this.pending = [];
        this.elapsed = 0;
        this.pocketTween = null;
        this.triangleAnimationSystem.cancel();
        this.tableEffectsManager.clearSelection();
        this.tableEffectsManager.clearBeaconImmediately?.();
        this.endEightSelection?.({ immediate: true });
        this.resetEndCinematic?.();
        this.resetScene?.({ resumeGameplay: true });
        this.setTestModeActive?.(false);
        this.active = false;
        this.#status("Test reset. Normal gameplay resumed.");
    }
    update(dt) {
        if (!this.active) {
            return;
        }
        this.elapsed += dt;
        while (this.pending.length && this.pending[0].at <= this.elapsed) {
            const action = this.pending.shift();
            action.fn?.();
        }
        if (this.pocketTween) {
            const tween = this.pocketTween;
            tween.elapsed += dt;
            const t = THREE.MathUtils.clamp(tween.elapsed / tween.duration, 0, 1);
            const eased = t * t * (3 - 2 * t);
            const approach = tween.approachFraction ?? 0;
            const flashAt = approach > 0 ? approach * 0.90 : 0.14;
            if (!tween.flashed && t >= flashAt) {
                tween.flashed = true;
                this.tableEffectsManager.triggerPocketFlash(tween.pocket.name, tween.color);
            }
            if (approach > 0 && t < approach) {
                const travelT = smootherstep01(t / approach);
                tween.body.position.lerpVectors(tween.start, new THREE.Vector3(tween.pocket.center.x, this.clothY + this.ballRadius, tween.pocket.center.z), travelT);
            }
            else {
                const dropT = approach > 0 ? smootherstep01((t - approach) / Math.max(0.001, 1 - approach)) : eased;
                tween.body.position.set(tween.pocket.center.x, THREE.MathUtils.lerp(this.clothY + this.ballRadius, this.clothY - this.ballRadius * 2.3, dropT), tween.pocket.center.z);
            }
            this.#stopBody(tween.body);
            if (t >= 1) {
                const onComplete = tween.onComplete;
                this.pocketTween = null;
                onComplete?.();
            }
        }
        this.syncVisuals?.();
    }
    dispose() {
        window.removeEventListener("keydown", this._onKeyDown);
        this.panel.remove();
    }
}
