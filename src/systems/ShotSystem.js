//DEPENDENCIES
import { BallState } from "../physics/RigidBall.js";
import { SHOT, PHYSICS } from "../config/constants.js";

//SHOT SYSTEM
export class ShotSystem {
    constructor({ cueRig, cueBallBody, cueImpactSystem, clearanceSystem }) {
        this.cueRig = cueRig;
        this.cueBallBody = cueBallBody;
        this.cueImpactSystem = cueImpactSystem;
        this.clearanceSystem = clearanceSystem;
        this.power = SHOT.DEFAULT_POWER;
        this.hitU = SHOT.DEFAULT_HIT_U;
        this.hitV = SHOT.DEFAULT_HIT_V;
        this.strokeStarted = false;
        this.shotCommitted = false;
        this.lastImpact = null;
        this.cueRig.setContactOffsetNormalized(this.hitU, this.hitV);
    }
    setPower(power) {
        this.power = Math.min(SHOT.MAX_POWER, Math.max(SHOT.MIN_POWER, power));
    }
    getPower() {
        return this.power;
    }
    setHitOffset(u, v) {
        if (this.strokeStarted || this.shotCommitted) {
            return;
        }
        this.cueRig.setContactOffsetNormalized(u, v);
        const hit = this.cueRig.getContactOffsetNormalized();
        this.hitU = hit.u;
        this.hitV = hit.v;
        this.clearanceSystem.update(true);
    }
    getHitOffset() {
        return {
            u: this.hitU,
            v: this.hitV
        };
    }
    resetHitOffset() {
        this.setHitOffset(SHOT.DEFAULT_HIT_U, SHOT.DEFAULT_HIT_V);
    }
    canShoot() {
        const speed = this.cueBallBody.velocity.length();
        const bodyReady = (this.cueBallBody.state === BallState.RESTING || this.cueBallBody.state === BallState.ROLLING) && speed < PHYSICS.REST_LINEAR_EPSILON * 2;
        return (bodyReady && !this.strokeStarted && !this.shotCommitted && !this.cueRig.strokeActive && !this.clearanceSystem.isDirectionBlocked());
    }
    requestShot(options = {}) {
        if (!this.canShoot()) {
            return false;
        }
        const started = this.cueRig.startStroke(this.power, options);
        if (started) {
            this.strokeStarted = true;
        }
        return started;
    }
    update() {
        if (this.strokeStarted && !this.shotCommitted && this.cueRig.consumeImpactEvent()) {
            this.lastImpact = this.cueImpactSystem.applyImpact(this.cueBallBody, this.cueRig, this.power);
            if (this.lastImpact) {
                this.lastImpact.targetMaxBallSpeed = SHOT.MAX_BALL_SPEED;
            }
            this.shotCommitted = true;
        }
    }
    rearmForNextShot() {
        this.strokeStarted = false;
        this.shotCommitted = false;
        this.cueRig.visible = true;
        this.cueRig.setContactOffsetNormalized(this.hitU, this.hitV);
        this.clearanceSystem.update(true);
    }
    reset() {
        this.strokeStarted = false;
        this.shotCommitted = false;
        this.lastImpact = null;
        this.cueRig.visible = true;
        this.cueRig.setContactOffsetNormalized(this.hitU, this.hitV);
    }
    hasCommittedShot() {
        return this.shotCommitted;
    }
    getLastImpact() {
        return this.lastImpact;
    }
}
