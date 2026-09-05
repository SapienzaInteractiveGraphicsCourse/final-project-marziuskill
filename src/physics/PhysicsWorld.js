//Advances rigid balls, resolves contacts and emits the gameplay events consumed by rules and audio.

//DEPENDENCIES
import * as THREE from "three";
import { BallState } from "./RigidBall.js";
import { EventType } from "../events/EventTypes.js";
import { PHYSICS, CLOTH, BALL_COLLISION, TABLE_CONTACT } from "../config/constants.js";

//SCRATCH STATE
const UP = new THREE.Vector3(0, 1, 0);
const _gravityForce = new THREE.Vector3();
const _samplePoint = new THREE.Vector3();
const _contactR = new THREE.Vector3();
const _omegaCrossR = new THREE.Vector3();
const _slipVelocity = new THREE.Vector3();
const _frictionImpulse = new THREE.Vector3();
const _angularImpulse = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();
const _rollingOmega = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _relativeVelocity = new THREE.Vector3();
const _collisionImpulse = new THREE.Vector3();
const _positionCorrection = new THREE.Vector3();
const _bbContactRA = new THREE.Vector3();
const _bbContactRB = new THREE.Vector3();
const _bbContactVelocityA = new THREE.Vector3();
const _bbContactVelocityB = new THREE.Vector3();
const _bbRelativeContactVelocity = new THREE.Vector3();
const _bbTangent = new THREE.Vector3();
const _bbTangentImpulse = new THREE.Vector3();
const _bbAngularImpulseA = new THREE.Vector3();
const _bbAngularImpulseB = new THREE.Vector3();
const _bbRCrossT = new THREE.Vector3();
const _tableNormalImpulse = new THREE.Vector3();
const _stepStartPosition = new THREE.Vector3();

//PHYSICS WORLD
export class PhysicsWorld {

    //INITIALIZATION
    constructor({ playingSurfaceSystem, railCollisionSystem, pocketSystem = null, pocketCaptureSystem = null, ballReturnCollisionSystem = null, clothY, eventSink = null }) {
        this.playingSurfaceSystem = playingSurfaceSystem;
        this.railCollisionSystem = railCollisionSystem;
        this.pocketSystem = pocketSystem;
        this.pocketCaptureSystem = pocketCaptureSystem;
        this.ballReturnCollisionSystem = ballReturnCollisionSystem;
        this.clothY = clothY;
        this.eventSink = typeof eventSink === "function" ? eventSink : null;
        this.activeBallImpactPairs = new Set();
        this.ballOverlapsThisStep = new Set();
        this.ballImpactEventsThisStep = new Set();
        this.gravity = new THREE.Vector3(0, -PHYSICS.GRAVITY, 0);
        this.balls = [];
        this.simulationTime = 0;
        this.totalCollisionCount = 0;
        this.lastCollision = null;
        this.totalTableImpactCount = 0;
        this.lastTableImpact = null;
    }

    //WORLD CONTENT
    addBall(body) {
        if (!this.balls.includes(body)) {
            this.balls.push(body);
        }
        return body;
    }
    removeBall(body) {
        const index = this.balls.indexOf(body);
        if (index >= 0) {
            this.balls.splice(index, 1);
        }
    }

    //DIAGNOSTICS
    resetCollisionStats() {
        this.totalCollisionCount = 0;
        this.lastCollision = null;
        this.railCollisionSystem?.resetStats();
        this.pocketSystem?.resetStats();
        this.pocketCaptureSystem?.resetStats();
        this.ballReturnCollisionSystem?.resetStats();
        this.totalTableImpactCount = 0;
        this.lastTableImpact = null;
        this.activeBallImpactPairs.clear();
        this.ballOverlapsThisStep.clear();
        this.ballImpactEventsThisStep.clear();
    }
    getCollisionStats() {
        return {
            total: this.totalCollisionCount,
            last: this.lastCollision
        };
    }
    getRailCollisionStats() {
        return (this.railCollisionSystem?.getStats() ?? {
            total: 0,
            last: null
        });
    }
    getPocketStats() {
        return (this.pocketSystem?.getStats() ?? {
            totalEntries: 0,
            totalPocketed: 0,
            lastEntry: null,
            lastPocketed: null
        });
    }
    getTableContactStats() {
        return {
            total: this.totalTableImpactCount,
            last: this.lastTableImpact
        };
    }
    getPocketCaptureStats() {
        return (this.pocketCaptureSystem?.getStats() ?? {
            throatCount: 0,
            totalImpacts: 0,
            last: null
        });
    }
    getBallReturnStats() {
        return (this.ballReturnCollisionSystem?.getStats() ?? {
            triangleCount: 0,
            totalImpacts: 0,
            last: null
        });
    }

    //SETTLEMENT
    areBallsSettled() {
        const linearLimit = PHYSICS.REST_LINEAR_EPSILON * 2.0;
        const angularLimit = PHYSICS.REST_ANGULAR_EPSILON * 2.0;
        const linearLimitSq = linearLimit * linearLimit;
        const angularLimitSq = angularLimit * angularLimit;
        return this.balls.every(ball => {
            if (ball.pocketCommitted || ball.state === BallState.COLLECTED || ball.state === BallState.FALLEN) {
                return true;
            }
            if (ball.state === BallState.FALLING || ball.state === BallState.AIRBORNE) {
                return false;
            }
            return (ball.velocity.lengthSq() <= linearLimitSq && ball.angularVelocity.lengthSq() <= angularLimitSq);
        });
    }

    //SIMULATION STEP
    //Advance fixed simulation time, then emit contact events only after the authoritative collision response is known.
    step(dt) {
        this.ballOverlapsThisStep.clear();
        this.ballImpactEventsThisStep.clear();
        this.railCollisionSystem?.beginStep?.();
        for (const ball of this.balls) {
            this.#stepBall(ball, dt);
        }
        for (let iteration = 0; iteration < BALL_COLLISION.SOLVER_ITERATIONS; iteration += 1) {
            for (const ball of this.balls) {
                if (!ball.pocketName && !ball.pocketCommitted && ball.state !== BallState.FALLEN && ball.state !== BallState.COLLECTED) {
                    this.railCollisionSystem?.resolveBall(ball);
                }
            }
            for (let i = 0; i < this.balls.length - 1; i += 1) {
                const a = this.balls[i];
                if (a.state === BallState.FALLEN || a.pocketName) {
                    continue;
                }
                for (let j = i + 1; j < this.balls.length; j += 1) {
                    const b = this.balls[j];
                    if (b.state === BallState.FALLEN || b.pocketName) {
                        continue;
                    }
                    this.#resolveBallBall(a, b);
                }
            }
        }
        const nextActivePairs = new Set();
        for (const key of this.activeBallImpactPairs) {
            if (this.ballOverlapsThisStep.has(key)) {
                nextActivePairs.add(key);
            }
        }
        for (const key of this.ballImpactEventsThisStep) {
            if (this.ballOverlapsThisStep.has(key)) {
                nextActivePairs.add(key);
            }
        }
        this.activeBallImpactPairs = nextActivePairs;
        this.railCollisionSystem?.endStep?.();
        this.simulationTime += dt;
    }

    //BALL COLLISIONS
    #resolveBallBall(a, b) {
        _delta.subVectors(b.position, a.position);
        const minDistance = a.radius + b.radius;
        const minDistanceSq = minDistance * minDistance;
        const distanceSq = _delta.lengthSq();
        if (distanceSq >= minDistanceSq) {
            return false;
        }
        const pairKey = a.label < b.label ? `${a.label}|${b.label}` : `${b.label}|${a.label}`;
        this.ballOverlapsThisStep.add(pairKey);
        let distance = Math.sqrt(distanceSq);
        if (distance > 1e-10) {
            _normal.copy(_delta).multiplyScalar(1 / distance);
        }
        else {
            _relativeVelocity.subVectors(b.velocity, a.velocity);
            if (_relativeVelocity.lengthSq() > 1e-10) {
                _normal.copy(_relativeVelocity).normalize();
            }
            else {
                _normal.set(1, 0, 0);
            }
            distance = 0;
        }
        const penetration = minDistance - distance;
        const invMassSum = a.invMass + b.invMass;
        if (invMassSum <= 0) {
            return false;
        }
        const correctionMagnitude = Math.max(penetration - BALL_COLLISION.POSITION_SLOP, 0) * BALL_COLLISION.POSITION_CORRECTION_PERCENT / invMassSum;
        if (correctionMagnitude > 0) {
            _positionCorrection.copy(_normal).multiplyScalar(correctionMagnitude);
            a.position.addScaledVector(_positionCorrection, -a.invMass);
            b.position.addScaledVector(_positionCorrection, b.invMass);
        }
        _relativeVelocity.subVectors(b.velocity, a.velocity);
        const normalClosingSpeed = _relativeVelocity.dot(_normal);
        if (normalClosingSpeed >= 0) {
            return true;
        }
        const closingSpeed = -normalClosingSpeed;
        const restitution = closingSpeed >= BALL_COLLISION.RESTITUTION_SPEED_THRESHOLD ? BALL_COLLISION.RESTITUTION : 0;
        const impulseMagnitude = -(1 + restitution) * normalClosingSpeed / invMassSum;
        _collisionImpulse.copy(_normal).multiplyScalar(impulseMagnitude);
        a.velocity.addScaledVector(_collisionImpulse, -a.invMass);
        b.velocity.addScaledVector(_collisionImpulse, b.invMass);
        _bbContactRA.copy(_normal).multiplyScalar(a.radius);
        _bbContactRB.copy(_normal).multiplyScalar(-b.radius);
        _bbContactVelocityA.crossVectors(a.angularVelocity, _bbContactRA).add(a.velocity);
        _bbContactVelocityB.crossVectors(b.angularVelocity, _bbContactRB).add(b.velocity);
        _bbRelativeContactVelocity.subVectors(_bbContactVelocityB, _bbContactVelocityA);
        _bbTangent.crossVectors(UP, _normal);
        let tangentImpulseMagnitude = 0;
        let tangentSpeed = 0;
        if (_bbTangent.lengthSq() > 1e-12) {
            _bbTangent.normalize();
            tangentSpeed = _bbRelativeContactVelocity.dot(_bbTangent);
            if (Math.abs(tangentSpeed) > BALL_COLLISION.TANGENTIAL_SPEED_EPSILON) {
                _bbRCrossT.crossVectors(_bbContactRA, _bbTangent);
                const rotationalA = _bbRCrossT.lengthSq() * a.invInertia;
                _bbRCrossT.crossVectors(_bbContactRB, _bbTangent);
                const rotationalB = _bbRCrossT.lengthSq() * b.invInertia;
                const tangentEffectiveInverseMass = a.invMass + b.invMass + rotationalA + rotationalB;
                if (tangentEffectiveInverseMass > 0) {
                    const impulseToStopTangentialSlip = -tangentSpeed / tangentEffectiveInverseMass;
                    const maxTangentImpulse = BALL_COLLISION.TANGENTIAL_FRICTION_COEFFICIENT * Math.abs(impulseMagnitude);
                    tangentImpulseMagnitude = THREE.MathUtils.clamp(impulseToStopTangentialSlip, -maxTangentImpulse, maxTangentImpulse);
                    _bbTangentImpulse.copy(_bbTangent).multiplyScalar(tangentImpulseMagnitude);
                    a.velocity.addScaledVector(_bbTangentImpulse, -a.invMass);
                    b.applyLinearImpulse(_bbTangentImpulse);
                    _bbAngularImpulseA.crossVectors(_bbContactRA, _bbTangentImpulse).multiplyScalar(-1);
                    _bbAngularImpulseB.crossVectors(_bbContactRB, _bbTangentImpulse);
                    a.applyAngularImpulse(_bbAngularImpulseA);
                    b.applyAngularImpulse(_bbAngularImpulseB);
                }
            }
        }
        this.totalCollisionCount += 1;
        if (a.state === BallState.COLLECTED) {
            a.state = BallState.RETURNING;
            a.returnSettledTime = 0;
        }
        if (b.state === BallState.COLLECTED) {
            b.state = BallState.RETURNING;
            b.returnSettledTime = 0;
        }
        this.lastCollision = {
            a: a.label,
            b: b.label,
            impulseMagnitude,
            tangentImpulseMagnitude,
            closingSpeed,
            tangentSpeed,
            restitution,
            tangentialFriction: BALL_COLLISION.TANGENTIAL_FRICTION_COEFFICIENT,
            normal: _normal.clone(),
            omegaYA: a.angularVelocity.y,
            omegaYB: b.angularVelocity.y
        };
        if (!(a.pocketCommitted && b.pocketCommitted) && !this.activeBallImpactPairs.has(pairKey) && !this.ballImpactEventsThisStep.has(pairKey)) {
            this.ballImpactEventsThisStep.add(pairKey);
            this.#emitEvent({
                type: EventType.BALL_CONTACT,
                a: a.label,
                b: b.label,
                position: {
                    x: (a.position.x + b.position.x) * 0.5,
                    y: (a.position.y + b.position.y) * 0.5,
                    z: (a.position.z + b.position.z) * 0.5
                },
                impulseMagnitude,
                tangentImpulseMagnitude,
                closingSpeed,
                restitution,
                normal: {
                    x: _normal.x,
                    y: _normal.y,
                    z: _normal.z
                }
            });
        }
        return true;
    }
    #emitEvent(event) {
        this.eventSink?.({
            ...event,
            simulationTime: this.simulationTime
        });
    }

    //BALL MOTION
    #stepBall(ball, dt) {
        if (ball.state === BallState.FALLEN || ball.state === BallState.COLLECTED) {
            ball.clearAccumulators();
            ball.velocity.set(0, 0, 0);
            ball.angularVelocity.set(0, 0, 0);
            ball.contactSlipSpeed = 0;
            ball.frictionRegime = ball.state === BallState.COLLECTED ? "RETURN_REST" : "NONE";
            return;
        }
        if (ball.pocketName && !ball.pocketCommitted) {
            this.#stepPocketCaptureDrop(ball, dt);
            return;
        }
        if (ball.pocketCommitted) {
            this.#stepPocketedBall(ball, dt);
            return;
        }
        ball.clearAccumulators();
        _stepStartPosition.copy(ball.position);
        const supportBefore = this.#querySupport(ball);
        const touchingBefore = supportBefore.hasSupport && ball.position.y <= supportBefore.y + ball.radius + PHYSICS.CONTACT_SLOP && ball.velocity.y <= 0;
        if (touchingBefore) {
            ball.position.y = supportBefore.y + ball.radius;
            const launched = this.#resolveTableNormalImpact(ball, supportBefore.y);
            if (launched) {
                ball.state = BallState.AIRBORNE;
                ball.contactSlipSpeed = 0;
                ball.frictionRegime = "NONE";
                _gravityForce.copy(this.gravity).multiplyScalar(ball.mass);
                ball.addForce(_gravityForce);
            }
            else {
                this.#solveClothFriction(ball, dt);
            }
        }
        else {
            _gravityForce.copy(this.gravity).multiplyScalar(ball.mass);
            ball.addForce(_gravityForce);
        }
        ball.integrateVelocities(dt);
        ball.integratePose(dt);
        const physicalPocketContact = this.pocketCaptureSystem?.findCaptureAlongSegment(ball, _stepStartPosition, ball.position);
        if (physicalPocketContact) {
            this.#capturePocketBall(ball, physicalPocketContact.pocket, physicalPocketContact.position);
            return;
        }
        this.railCollisionSystem?.resolveBall(ball);
        const supportAfter = this.#querySupport(ball);
        ball.hasSupport = supportAfter.hasSupport;
        if (supportAfter.hasSupport) {
            this.pocketSystem?.cancelUncommittedEntry(ball);
            const contactY = supportAfter.y + ball.radius;
            if (ball.position.y <= contactY + PHYSICS.CONTACT_SLOP && ball.velocity.y <= 0) {
                ball.position.y = contactY;
                const relaunched = this.#resolveTableNormalImpact(ball, supportAfter.y);
                if (relaunched) {
                    ball.state = BallState.AIRBORNE;
                    ball.contactSlipSpeed = 0;
                    ball.frictionRegime = "NONE";
                    return;
                }
                if (!touchingBefore) {
                    this.#classifyContactState(ball);
                }
                return;
            }
            ball.state = BallState.AIRBORNE;
            ball.contactSlipSpeed = 0;
            ball.frictionRegime = "NONE";
            return;
        }
        const fallbackPocket = this.pocketSystem?.findPocketForUnsupportedBall(ball);
        if (fallbackPocket) {
            this.#capturePocketBall(ball, fallbackPocket, ball.position);
            return;
        }
        ball.contactSlipSpeed = 0;
        ball.frictionRegime = "NONE";
        if (ball.position.y < this.clothY - PHYSICS.FALLEN_DEPTH) {
            ball.state = BallState.FALLEN;
            ball.velocity.set(0, 0, 0);
            ball.angularVelocity.set(0, 0, 0);
        }
        else {
            ball.state = BallState.FALLING;
        }
    }

    //POCKETS
    #capturePocketBall(ball, pocket, contactPosition) {
        if (!pocket || ball.pocketName) {
            return;
        }
        ball.position.copy(contactPosition);
        this.pocketSystem.beginEntry(ball, pocket);
        this.pocketCaptureSystem?.noteCapture(ball, pocket, contactPosition);
        ball.velocity.x = 0;
        ball.velocity.z = 0;
        if (ball.velocity.y > 0) {
            ball.velocity.y = 0;
        }
        ball.angularVelocity.set(0, 0, 0);
        ball.hasSupport = false;
        ball.contactSlipSpeed = 0;
        ball.frictionRegime = "NONE";
        ball.state = BallState.POCKET_CAPTURED;
    }
    #stepPocketCaptureDrop(ball, dt) {
        ball.clearAccumulators();
        _gravityForce.copy(this.gravity).multiplyScalar(ball.mass);
        ball.addForce(_gravityForce);
        ball.integrateVelocities(dt);
        ball.integratePose(dt);
        ball.velocity.x = 0;
        ball.velocity.z = 0;
        this.pocketSystem?.updatePocketCommit(ball);
        if (ball.pocketCommitted) {
            this.ballReturnCollisionSystem?.prepareBall(ball);
            ball.state = BallState.FALLING;
            return;
        }
        ball.state = BallState.POCKET_CAPTURED;
    }
    #stepPocketedBall(ball, dt) {
        const returnSystem = this.ballReturnCollisionSystem;
        if (!returnSystem) {
            ball.state = BallState.FALLING;
            return;
        }
        returnSystem.prepareBall(ball);
        const floorY = ball.returnFloorY;
        if (!Number.isFinite(floorY)) {
            ball.state = BallState.FALLEN;
            ball.velocity.set(0, 0, 0);
            return;
        }
        const contactY = floorY + ball.radius;
        if (ball.position.y > contactY) {
            ball.clearAccumulators();
            _gravityForce.copy(this.gravity).multiplyScalar(ball.mass);
            ball.addForce(_gravityForce);
            ball.velocity.x = 0;
            ball.velocity.z = 0;
            ball.integrateVelocities(dt);
            ball.integratePose(dt);
            ball.velocity.x = 0;
            ball.velocity.z = 0;
            if (ball.position.y > contactY) {
                ball.state = BallState.FALLING;
                return;
            }
        }
        ball.position.y = contactY;
        ball.velocity.y = 0;
        ball.state = BallState.RETURNING;
        ball.contactSlipSpeed = 0;
        ball.frictionRegime = "RETURNING";
        returnSystem.advanceBall(ball, dt, this.balls);
    }
    #resolveTableNormalImpact(ball, supportY) {
        const normalVelocity = ball.velocity.y;
        if (normalVelocity >= 0) {
            return false;
        }
        const closingSpeed = -normalVelocity;
        const restitution = closingSpeed >= TABLE_CONTACT.RESTITUTION_SPEED_THRESHOLD ? TABLE_CONTACT.RESTITUTION : 0;
        const normalImpulseMagnitude = -(1 + restitution) * normalVelocity / ball.invMass;
        _tableNormalImpulse.set(0, normalImpulseMagnitude, 0);
        ball.applyLinearImpulse(_tableNormalImpulse);
        const launchSpeed = Math.max(0, ball.velocity.y);
        const ballisticRise = launchSpeed > 0 ? (launchSpeed * launchSpeed / (2 * PHYSICS.GRAVITY)) : 0;
        if (closingSpeed >= TABLE_CONTACT.STATS_SPEED_THRESHOLD) {
            this.totalTableImpactCount += 1;
            this.lastTableImpact = {
                ball: ball.label,
                supportY,
                closingSpeed,
                restitution,
                normalImpulseMagnitude,
                launchSpeed,
                ballisticRise
            };
        }
        if (restitution <= 0 || launchSpeed <= PHYSICS.REST_LINEAR_EPSILON) {
            ball.velocity.y = 0;
            return false;
        }
        return true;
    }

    //CLOTH CONTACT
    #solveClothFriction(ball, dt) {
        this.#dampVerticalSideSpin(ball, dt);
        _contactR.set(0, -ball.radius, 0);
        _omegaCrossR.crossVectors(ball.angularVelocity, _contactR);
        _slipVelocity.copy(ball.velocity).add(_omegaCrossR);
        _slipVelocity.y = 0;
        let slipSpeed = _slipVelocity.length();
        ball.contactSlipSpeed = slipSpeed;
        if (slipSpeed > CLOTH.ROLLING_CAPTURE_SPEED) {
            ball.frictionRegime = "SLIDING";
            const effectiveInverseMass = ball.invMass + ball.radius * ball.radius * ball.invInertia;
            const impulseToStopSlip = slipSpeed / effectiveInverseMass;
            const maxFrictionImpulse = CLOTH.SLIDING_FRICTION_COEFFICIENT * ball.mass * PHYSICS.GRAVITY * dt;
            const impulseMagnitude = Math.min(impulseToStopSlip, maxFrictionImpulse);
            _frictionImpulse.copy(_slipVelocity).multiplyScalar(-impulseMagnitude / slipSpeed);
            ball.applyLinearImpulse(_frictionImpulse);
            _angularImpulse.crossVectors(_contactR, _frictionImpulse);
            ball.applyAngularImpulse(_angularImpulse);
            _omegaCrossR.crossVectors(ball.angularVelocity, _contactR);
            _slipVelocity.copy(ball.velocity).add(_omegaCrossR);
            _slipVelocity.y = 0;
            slipSpeed = _slipVelocity.length();
            ball.contactSlipSpeed = slipSpeed;
            if (slipSpeed <= CLOTH.ROLLING_CAPTURE_SPEED) {
                this.#snapToPureRolling(ball);
                ball.frictionRegime = "ROLLING";
                ball.state = BallState.ROLLING;
            }
            else {
                ball.frictionRegime = "SLIDING";
                ball.state = BallState.SLIDING;
            }
            return;
        }
        ball.frictionRegime = "ROLLING";
        this.#snapToPureRolling(ball);
        _horizontalVelocity.set(ball.velocity.x, 0, ball.velocity.z);
        const speed = _horizontalVelocity.length();
        if (speed <= CLOTH.STOP_SPEED) {
            ball.frictionRegime = "REST";
            ball.setAtRest();
            return;
        }
        const speedLoss = CLOTH.ROLLING_RESISTANCE_COEFFICIENT * PHYSICS.GRAVITY * dt;
        const newSpeed = Math.max(0, speed - speedLoss);
        if (newSpeed <= CLOTH.STOP_SPEED) {
            ball.frictionRegime = "REST";
            ball.setAtRest();
            return;
        }
        _horizontalVelocity.multiplyScalar(newSpeed / speed);
        ball.velocity.x = _horizontalVelocity.x;
        ball.velocity.z = _horizontalVelocity.z;
        this.#snapToPureRolling(ball);
        ball.contactSlipSpeed = 0;
        ball.frictionRegime = "ROLLING";
        ball.state = BallState.ROLLING;
    }
    #dampVerticalSideSpin(ball, dt) {
        const omegaY = ball.angularVelocity.y;
        if (Math.abs(omegaY) < 1e-8) {
            ball.angularVelocity.y = 0;
            return;
        }
        const decay = Math.exp(-CLOTH.SIDE_SPIN_DAMPING * dt);
        ball.angularVelocity.y *= decay;
        if (Math.abs(ball.angularVelocity.y) < 0.01) {
            ball.angularVelocity.y = 0;
        }
    }
    #snapToPureRolling(ball) {
        _horizontalVelocity.set(ball.velocity.x, 0, ball.velocity.z);
        _rollingOmega.crossVectors(UP, _horizontalVelocity).multiplyScalar(1 / ball.radius);
        ball.angularVelocity.x = _rollingOmega.x;
        ball.angularVelocity.z = _rollingOmega.z;
    }
    #classifyContactState(ball) {
        _contactR.set(0, -ball.radius, 0);
        _omegaCrossR.crossVectors(ball.angularVelocity, _contactR);
        _slipVelocity.copy(ball.velocity).add(_omegaCrossR);
        _slipVelocity.y = 0;
        const slip = _slipVelocity.length();
        ball.contactSlipSpeed = slip;
        const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
        if (speed <= CLOTH.STOP_SPEED && slip <= CLOTH.ROLLING_CAPTURE_SPEED) {
            ball.frictionRegime = "REST";
            ball.setAtRest();
        }
        else if (slip > CLOTH.ROLLING_CAPTURE_SPEED) {
            ball.frictionRegime = "SLIDING";
            ball.state = BallState.SLIDING;
        }
        else {
            ball.frictionRegime = "ROLLING";
            ball.state = BallState.ROLLING;
        }
    }
    #querySupport(ball) {
        const maxDistance = ball.radius + PHYSICS.SUPPORT_RAY_EXTRA + Math.max(0, ball.position.y - this.clothY);
        _samplePoint.copy(ball.position);
        const hit = this.playingSurfaceSystem.getSupportBelow(_samplePoint, maxDistance);
        if (!hit) {
            return {
                hasSupport: false,
                y: Number.NaN
            };
        }
        return {
            hasSupport: true,
            y: hit.point.y
        };
    }
}
