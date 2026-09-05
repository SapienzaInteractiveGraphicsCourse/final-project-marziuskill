//DEPENDENCIES
import * as THREE from "three";
import { BALL } from "../config/constants.js";

//BALL STATE
export const BallState = Object.freeze({
    RESTING: "RESTING",
    SLIDING: "SLIDING",
    ROLLING: "ROLLING",
    AIRBORNE: "AIRBORNE",
    FALLING: "FALLING",
    POCKET_CAPTURED: "POCKET_CAPTURED",
    RETURNING: "RETURNING",
    COLLECTED: "COLLECTED",
    FALLEN: "FALLEN"
});

//SCRATCH STATE
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();
let nextRigidBallId = 1;

//RIGID BALL
export class RigidBall {
    constructor({ position = new THREE.Vector3(), radius = BALL.RADIUS, mass = BALL.MASS, label = null } = {}) {
        this.id = nextRigidBallId++;
        this.label = label ?? `Ball ${this.id}`;
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.orientation = new THREE.Quaternion();
        this.angularVelocity = new THREE.Vector3();
        this.force = new THREE.Vector3();
        this.torque = new THREE.Vector3();
        this.radius = radius;
        this.mass = mass;
        this.invMass = mass > 0 ? 1 / mass : 0;
        this.inertia = (2 / 5) * mass * radius * radius;
        this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;
        this.state = BallState.AIRBORNE;
        this.hasSupport = false;
        this.contactSlipSpeed = 0;
        this.frictionRegime = "NONE";
        this.pocketName = null;
        this.pocketCommitted = false;
        this.returnSettledTime = 0;
        this.returnTargetId = null;
        this.returnFloorY = null;
        this.returnStage = null;
        this.returnLaneCoordinate = null;
    }
    clearAccumulators() {
        this.force.set(0, 0, 0);
        this.torque.set(0, 0, 0);
    }
    addForce(force) {
        this.force.add(force);
    }
    addTorque(torque) {
        this.torque.add(torque);
    }
    applyLinearImpulse(impulse) {
        if (this.invMass === 0)
            return;
        this.velocity.addScaledVector(impulse, this.invMass);
    }
    applyAngularImpulse(angularImpulse) {
        if (this.invInertia === 0)
            return;
        this.angularVelocity.addScaledVector(angularImpulse, this.invInertia);
    }
    integrateVelocities(dt) {
        if (this.invMass > 0) {
            this.velocity.addScaledVector(this.force, this.invMass * dt);
        }
        if (this.invInertia > 0) {
            this.angularVelocity.addScaledVector(this.torque, this.invInertia * dt);
        }
    }
    integratePose(dt) {
        this.position.addScaledVector(this.velocity, dt);
        this.integrateOrientation(dt);
    }
    integrateOrientation(dt) {
        const omega = this.angularVelocity.length();
        if (omega > 1e-10) {
            _axis.copy(this.angularVelocity).multiplyScalar(1 / omega);
            _dq.setFromAxisAngle(_axis, omega * dt);
            this.orientation.premultiply(_dq).normalize();
        }
    }
    setAtRest() {
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.contactSlipSpeed = 0;
        this.frictionRegime = "REST";
        this.state = BallState.RESTING;
    }
}
