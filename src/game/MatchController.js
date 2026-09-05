//DEPENDENCIES
import { ShotEventRecorder } from "./ShotEventRecorder.js";
import { RuleSet8Ball, RuleMode } from "./RuleSet8Ball.js";

//MATCH PHASES
export const MatchPhase = Object.freeze({
    BREAK_SETUP: "BREAK_SETUP",
    AIMING: "AIMING",
    SHOT_IN_PROGRESS: "SHOT_IN_PROGRESS",
    SCRATCH_PENDING: "SCRATCH_PENDING",
    BALL_IN_HAND: "BALL_IN_HAND",
    GAME_OVER: "GAME_OVER"
});

//MATCH CONTROLLER
export class MatchController {

    //INITIALIZATION
    constructor({ ruleMode = RuleMode.SOLO_RUNOUT, playerNames = null } = {}) {
        this.recorder = new ShotEventRecorder();
        this.ruleSet = new RuleSet8Ball({
            mode: ruleMode,
            playerNames
        });
        this.phase = MatchPhase.BREAK_SETUP;
        this.shotNumber = 0;
    }

    //MATCH STATE
    reset() {
        this.recorder.reset();
        this.ruleSet.reset();
        this.phase = MatchPhase.BREAK_SETUP;
        this.shotNumber = 0;
    }
    isShotActive() {
        return this.recorder.hasActiveShot();
    }

    //SHOT LIFECYCLE
    startShot({ simulationTime, impact }) {
        if (this.isShotActive() || !this.ruleSet.canStartShot()) {
            return null;
        }
        this.shotNumber += 1;
        this.phase = MatchPhase.SHOT_IN_PROGRESS;
        return this.recorder.beginShot({
            shotNumber: this.shotNumber,
            simulationTime,
            impact
        });
    }
    recordPhysicsEvent(event) {
        return this.recorder.record(event);
    }
    finishShot({ simulationTime, balls }) {
        const result = this.recorder.endShot({
            simulationTime,
            balls
        });
        if (!result) {
            return null;
        }
        const ruling = this.ruleSet.evaluateShot(result);
        this.phase = ruling?.gameOver ? MatchPhase.GAME_OVER : (ruling?.ballInHand ? MatchPhase.SCRATCH_PENDING : MatchPhase.AIMING);
        return {
            ...result,
            ruling
        };
    }

    //BALL IN HAND
    beginBallInHand() {
        this.phase = MatchPhase.BALL_IN_HAND;
    }
    completeBallInHand() {
        if (this.phase !== MatchPhase.BALL_IN_HAND) {
            return false;
        }
        if (!this.ruleSet.completePlacement()) {
            return false;
        }
        this.phase = MatchPhase.AIMING;
        return true;
    }
    forceSoloLoss(reason = "SOLO_MOVE_LIMIT") {
        const ruling = this.ruleSet.forceSoloLoss(reason);
        if (ruling) {
            this.phase = MatchPhase.GAME_OVER;
        }
        return ruling;
    }
    canStartShot() {
        return (this.phase === MatchPhase.AIMING && this.ruleSet.canStartShot());
    }
    getShotLockReason() {
        if (this.phase === MatchPhase.GAME_OVER) {
            return "Game over.";
        }
        if (this.phase !== MatchPhase.AIMING) {
            return `Match phase: ${this.phase}.`;
        }
        return this.ruleSet.getShotLockReason();
    }
    callEightPocket(pocketName) {
        return this.ruleSet.callEightPocket(pocketName);
    }
    getRuleState() {
        return this.ruleSet.getState();
    }
    getPendingPlacementMode() {
        return this.ruleSet.placementMode;
    }

    //DEBUG STATE
    getDebugState({ maxEventLines = 10 } = {}) {
        const current = this.recorder.getCurrentView();
        const last = this.recorder.getLastView();
        const shown = current ?? last;
        const summary = shown?.summary ?? {
            firstObjectContact: null,
            ballContactCount: 0,
            railContactCount: 0,
            railAfterFirstObjectContact: false,
            uniqueObjectRailBallCount: 0,
            pocketedBalls: [],
            scratch: false
        };
        return {
            phase: this.phase,
            shotNumber: this.shotNumber,
            active: Boolean(current),
            showing: current ? "CURRENT" : (last ? "LAST" : "NONE"),
            eventCount: shown?.eventCount ?? 0,
            firstObjectContact: summary.firstObjectContact,
            ballContactCount: summary.ballContactCount,
            railContactCount: summary.railContactCount,
            railAfterFirstObjectContact: summary.railAfterFirstObjectContact,
            uniqueObjectRailBallCount: summary.uniqueObjectRailBallCount ?? 0,
            pocketedBalls: [...summary.pocketedBalls],
            scratch: summary.scratch,
            rules: this.ruleSet.getState(),
            eventLines: shown ? shown.eventLines.slice(-maxEventLines) : []
        };
    }
    getLastShot() {
        return this.recorder.getLastView();
    }
    getShotHistory() {
        return this.recorder.getHistory();
    }
}
