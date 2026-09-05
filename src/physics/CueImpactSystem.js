//DEPENDENCIES
import * as THREE from "three";
import { SHOT } from "../config/constants.js";

//SCRATCH STATE
const _cueDirection3D = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _contactVector = new THREE.Vector3();
const _angularImpulse = new THREE.Vector3();

//CUE IMPACT
export class CueImpactSystem {
    constructor() {
        this.lastImpact = null;
    }
    applyImpact(ball, cueRig, power) {
        const p = THREE.MathUtils.clamp(power, SHOT.MIN_POWER, SHOT.MAX_POWER);
        cueRig.getShotDirectionWorld(_cueDirection3D);
        if (_cueDirection3D.lengthSq() < 1e-12) {
            throw new Error("Cue direction is degenerate.");
        }
        _cueDirection3D.normalize();
        cueRig.getContactVectorWorld(_contactVector);
        const targetSpeed = SHOT.MAX_BALL_SPEED * p;
        const impulseMagnitude = ball.mass * targetSpeed;
        _impulse.copy(_cueDirection3D).multiplyScalar(impulseMagnitude);
        _angularImpulse.crossVectors(_contactVector, _impulse);
        ball.applyLinearImpulse(_impulse);
        ball.applyAngularImpulse(_angularImpulse);
        const horizontalDirectionLength = Math.hypot(_cueDirection3D.x, _cueDirection3D.z);
        const horizontalImpulseMagnitude = Math.hypot(_impulse.x, _impulse.z);
        const downwardImpulseMagnitude = Math.max(0, -_impulse.y);
        const horizontalTargetSpeed = targetSpeed * horizontalDirectionLength;
        const downwardTargetSpeed = Math.max(0, -targetSpeed * _cueDirection3D.y);
        const hit = cueRig.getContactOffsetNormalized();
        this.lastImpact = {
            power: p,
            elevationDeg: cueRig.getElevationDeg(),
            targetSpeed,
            horizontalTargetSpeed,
            downwardTargetSpeed,
            impulseMagnitude,
            horizontalImpulseMagnitude,
            downwardImpulseMagnitude,
            direction: _cueDirection3D.clone(),
            cueDirection3D: _cueDirection3D.clone(),
            impulse: _impulse.clone(),
            contactVector: _contactVector.clone(),
            angularImpulse: _angularImpulse.clone(),
            hitU: hit.u,
            hitV: hit.v
        };
        return this.lastImpact;
    }
}
