//DEPENDENCIES
import * as THREE from "three";

//ANIMATION STATE
export const CpuCueAnimationPhase = Object.freeze({
    IDLE: "IDLE",
    FADE_IN: "FADE_IN",
    CHARGE: "CHARGE",
    STRIKE: "STRIKE",
    FADE_OUT: "FADE_OUT",
    END_APPEAR: "END_APPEAR",
    END_RECOVER: "END_RECOVER",
    END_SALUTE: "END_SALUTE",
    END_FADE: "END_FADE"
});

//HELPERS
function smoothstep01(t) {
    const x = THREE.MathUtils.clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}

//CPU CUE ANIMATION
export class CpuCueAnimator {
    constructor({ cueRig, shotSystem, audioManager = null }) {
        this.cueRig = cueRig;
        this.shotSystem = shotSystem;
        this.audioManager = audioManager;
        this.phase = CpuCueAnimationPhase.IDLE;
        this.time = 0;
        this.power = 0;
        this.fadeInDuration = this.audioManager?.getDuration?.("killCueAppear") ?? 0.95;
        this.fadeOutDuration = this.audioManager?.getDuration?.("killCueDisappear") ?? 0.88;
        this.chargeDuration = 0.82;
        this.endAppearDuration = this.fadeInDuration;
        this.endRecoverDuration = 0.48;
        this.endSaluteHoldDuration = 0.36;
        this.endFadeDuration = this.fadeOutDuration;
        this.endStartElevationDeg = 0;
        this.endTargetElevationDeg = 52;
        this.endBasePosition = null;
        this.endTargetPosition = null;
        this.cueVfxHandle = null;
        this.materials = [];
        this.#makeCueMaterialsIndependent();
        this.#setOpacity(1);
        this.cueRig.visible = false;
    }
    #makeCueMaterialsIndependent() {
        this.cueRig.cue.traverse(child => {
            if (!child.isMesh || !child.material) {
                return;
            }
            const cloneMaterial = material => {
                const copy = material.clone();
                copy.transparent = true;
                copy.depthWrite = true;
                this.materials.push(copy);
                return copy;
            };
            if (Array.isArray(child.material)) {
                child.material = child.material.map(cloneMaterial);
            }
            else {
                child.material = cloneMaterial(child.material);
            }
        });
    }
    #setOpacity(value) {
        const opacity = THREE.MathUtils.clamp(value, 0, 1);
        for (const material of this.materials) {
            material.opacity = opacity;
            material.transparent = opacity < 0.999;
            material.needsUpdate = true;
        }
    }
    #cueWorldPosition() {
        const position = new THREE.Vector3();
        this.cueRig.getWorldPosition(position);
        return position;
    }
    #playCueVfx(name, gain = 0.58) {
        this.cueVfxHandle?.stop?.({ fadeOut: 0.04 });
        this.cueVfxHandle = this.audioManager?.play?.(name, {
            position: this.#cueWorldPosition(),
            gain,
            refDistance: 0.75,
            maxDistance: 9.0,
            rolloffFactor: 1.10
        }) ?? null;
    }
    getEndSaluteLeadDuration() {
        return (this.endAppearDuration + this.endRecoverDuration + this.endSaluteHoldDuration);
    }
    isBusy() {
        return this.phase !== CpuCueAnimationPhase.IDLE;
    }
    getState() {
        let progress = 0;
        if (this.phase === CpuCueAnimationPhase.FADE_IN) {
            progress = this.time / this.fadeInDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.CHARGE) {
            progress = this.time / this.chargeDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.STRIKE) {
            progress = 1;
        }
        else if (this.phase === CpuCueAnimationPhase.FADE_OUT) {
            progress = this.time / this.fadeOutDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.END_APPEAR) {
            progress = this.time / this.endAppearDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.END_RECOVER) {
            progress = this.time / this.endRecoverDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.END_SALUTE) {
            progress = this.time / this.endSaluteHoldDuration;
        }
        else if (this.phase === CpuCueAnimationPhase.END_FADE) {
            progress = this.time / this.endFadeDuration;
        }
        return {
            phase: this.phase,
            progress: THREE.MathUtils.clamp(progress, 0, 1),
            power: this.power
        };
    }
    start() {
        if (this.isBusy() || !this.shotSystem.canShoot()) {
            return false;
        }
        this.power = this.shotSystem.getPower();
        this.time = 0;
        this.phase = CpuCueAnimationPhase.FADE_IN;
        this.cueRig.clearStrokeOffsetPreview();
        this.cueRig.visible = true;
        this.#setOpacity(0);
        this.#playCueVfx("killCueAppear");
        return true;
    }
    cancel() {
        this.phase = CpuCueAnimationPhase.IDLE;
        this.time = 0;
        this.power = 0;
        this.#setOpacity(1);
        this.cueRig.clearStrokeOffsetPreview();
        if (this.endBasePosition) {
            this.cueRig.position.copy(this.endBasePosition);
            this.cueRig.setElevationDeg(this.endStartElevationDeg);
        }
        this.endBasePosition = null;
        this.endTargetPosition = null;
        this.cueRig.visible = false;
        this.cueVfxHandle?.stop?.({ fadeOut: 0.03 });
        this.cueVfxHandle = null;
    }
    startEndMatchSalute() {
        this.time = 0;
        this.phase = CpuCueAnimationPhase.END_APPEAR;
        this.endStartElevationDeg = this.cueRig.getElevationDeg?.() ?? 0;
        this.endTargetElevationDeg = 52;
        this.endBasePosition = this.cueRig.position.clone();
        const shotDirection = this.cueRig.getShotDirectionWorld(new THREE.Vector3()).setY(0);
        if (shotDirection.lengthSq() < 1e-8) {
            shotDirection.set(0, 0, 1);
        }
        else {
            shotDirection.normalize();
        }
        const right = new THREE.Vector3(shotDirection.z, 0, -shotDirection.x).normalize();
        this.endTargetPosition = this.endBasePosition.clone().addScaledVector(shotDirection, -0.46).addScaledVector(right, 0.30).add(new THREE.Vector3(0, 0.16, 0));
        this.cueRig.clearStrokeOffsetPreview();
        this.cueRig.visible = true;
        this.#setOpacity(0);
        this.#playCueVfx("killCueAppear", 0.62);
        return true;
    }
    update(dt) {
        if (this.phase === CpuCueAnimationPhase.IDLE) {
            return;
        }
        this.time += dt;
        if (this.phase === CpuCueAnimationPhase.FADE_IN) {
            const t = smoothstep01(this.time / this.fadeInDuration);
            this.#setOpacity(t);
            if (this.time >= this.fadeInDuration) {
                this.time = 0;
                this.phase = CpuCueAnimationPhase.CHARGE;
                this.#setOpacity(1);
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.CHARGE) {
            const t = smoothstep01(this.time / this.chargeDuration);
            const backswing = this.cueRig.getBackswingForPower(this.power);
            this.cueRig.setStrokeOffsetPreview(THREE.MathUtils.lerp(0, backswing, t));
            if (this.time >= this.chargeDuration) {
                this.time = 0;
                if (this.shotSystem.requestShot({
                    skipCharge: true
                })) {
                    this.phase = CpuCueAnimationPhase.STRIKE;
                }
                else {
                    this.phase = CpuCueAnimationPhase.FADE_OUT;
                    this.#playCueVfx("killCueDisappear");
                }
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.STRIKE) {
            if (!this.cueRig.strokeActive && this.shotSystem.hasCommittedShot()) {
                this.time = 0;
                this.phase = CpuCueAnimationPhase.FADE_OUT;
                this.#playCueVfx("killCueDisappear");
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.FADE_OUT) {
            const t = smoothstep01(this.time / this.fadeOutDuration);
            this.#setOpacity(1 - t);
            if (this.time >= this.fadeOutDuration) {
                this.#setOpacity(1);
                this.cueRig.clearStrokeOffsetPreview();
                if (this.endBasePosition) {
                    this.cueRig.position.copy(this.endBasePosition);
                    this.cueRig.setElevationDeg(this.endStartElevationDeg);
                }
                this.endBasePosition = null;
                this.endTargetPosition = null;
                this.cueRig.visible = false;
                this.phase = CpuCueAnimationPhase.IDLE;
                this.time = 0;
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.END_APPEAR) {
            const t = smoothstep01(this.time / this.endAppearDuration);
            this.#setOpacity(t);
            if (this.time >= this.endAppearDuration) {
                this.time = 0;
                this.phase = CpuCueAnimationPhase.END_RECOVER;
                this.#setOpacity(1);
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.END_RECOVER) {
            const t = smoothstep01(this.time / this.endRecoverDuration);
            const backswing = THREE.MathUtils.lerp(0, 0.060, t);
            this.cueRig.setStrokeOffsetPreview(backswing);
            this.cueRig.setElevationDeg(THREE.MathUtils.lerp(this.endStartElevationDeg, this.endTargetElevationDeg, t));
            if (this.endBasePosition && this.endTargetPosition) {
                this.cueRig.position.lerpVectors(this.endBasePosition, this.endTargetPosition, t);
            }
            this.#setOpacity(1);
            if (this.time >= this.endRecoverDuration) {
                this.time = 0;
                this.phase = CpuCueAnimationPhase.END_SALUTE;
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.END_SALUTE) {
            this.cueRig.setStrokeOffsetPreview(0.060);
            this.cueRig.setElevationDeg(this.endTargetElevationDeg);
            if (this.endTargetPosition) {
                this.cueRig.position.copy(this.endTargetPosition);
            }
            this.#setOpacity(1);
            if (this.time >= this.endSaluteHoldDuration) {
                this.time = 0;
                this.phase = CpuCueAnimationPhase.END_FADE;
                this.#playCueVfx("killCueDisappear", 0.62);
            }
            return;
        }
        if (this.phase === CpuCueAnimationPhase.END_FADE) {
            const t = smoothstep01(this.time / this.endFadeDuration);
            this.cueRig.setStrokeOffsetPreview(0.060);
            this.cueRig.setElevationDeg(this.endTargetElevationDeg);
            if (this.endTargetPosition) {
                this.cueRig.position.copy(this.endTargetPosition);
            }
            this.#setOpacity(1 - t);
            if (this.time >= this.endFadeDuration) {
                this.#setOpacity(1);
                this.cueRig.clearStrokeOffsetPreview();
                if (this.endBasePosition) {
                    this.cueRig.position.copy(this.endBasePosition);
                    this.cueRig.setElevationDeg(this.endStartElevationDeg);
                }
                this.endBasePosition = null;
                this.endTargetPosition = null;
                this.cueRig.visible = false;
                this.phase = CpuCueAnimationPhase.IDLE;
                this.time = 0;
            }
        }
    }
    blocksPosition(position, radius = 0.34) {
        if (!this.isBusy() || !this.cueRig.visible) {
            return false;
        }
        const shotDirection = this.cueRig.getShotDirectionWorld(new THREE.Vector3());
        const tip = new THREE.Vector3();
        this.cueRig.strokePivot.getWorldPosition(tip);
        const a = tip.clone();
        const b = tip.clone().addScaledVector(shotDirection, -2.6);
        const p = new THREE.Vector2(position.x, position.z);
        const a2 = new THREE.Vector2(a.x, a.z);
        const b2 = new THREE.Vector2(b.x, b.z);
        const ab = b2.clone().sub(a2);
        const ap = p.clone().sub(a2);
        const denom = ab.lengthSq();
        if (denom < 1e-10) {
            return p.distanceTo(a2) < radius;
        }
        const t = THREE.MathUtils.clamp(ap.dot(ab) / denom, 0, 1);
        const closest = a2.addScaledVector(ab, t);
        return p.distanceTo(closest) < radius;
    }
}
