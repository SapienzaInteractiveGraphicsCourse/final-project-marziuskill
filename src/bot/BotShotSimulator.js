//DEPENDENCIES
import * as THREE from "three";
import { BALL, BOT_PLANNER, PHYSICS } from "../config/constants.js";
import { RigidBall, BallState } from "../physics/RigidBall.js";
import { PhysicsWorld } from "../physics/PhysicsWorld.js";
import { RailCollisionSystem } from "../physics/RailCollisionSystem.js";
import { PocketCaptureSystem } from "../physics/PocketCaptureSystem.js";
import { CueImpactSystem } from "../physics/CueImpactSystem.js";
import { PocketSystem } from "../systems/PocketSystem.js";
import { ShotEventRecorder } from "../game/ShotEventRecorder.js";

//SCRATCH STATE
const _yawQuaternion = new THREE.Quaternion();
const _elevationQuaternion = new THREE.Quaternion();
const _cueQuaternion = new THREE.Quaternion();
const _localOffset = new THREE.Vector3();
const _shotDirection = new THREE.Vector3();
const _contactVector = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
function cloneRigidBall(source) {
    const clone = new RigidBall({
        position: source.position,
        radius: source.radius,
        mass: source.mass,
        label: source.label
    });
    clone.velocity.copy(source.velocity);
    clone.orientation.copy(source.orientation);
    clone.angularVelocity.copy(source.angularVelocity);
    clone.force.copy(source.force);
    clone.torque.copy(source.torque);
    clone.state = source.state;
    clone.hasSupport = source.hasSupport;
    clone.contactSlipSpeed = source.contactSlipSpeed;
    clone.frictionRegime = source.frictionRegime;
    clone.pocketName = source.pocketName;
    clone.pocketCommitted = source.pocketCommitted;
    clone.returnSettledTime = source.returnSettledTime;
    clone.returnTargetId = source.returnTargetId;
    clone.returnFloorY = source.returnFloorY;
    clone.returnStage = source.returnStage;
    clone.returnLaneCoordinate = source.returnLaneCoordinate;
    return clone;
}
function isInPlay(ball) {
    if (ball.pocketCommitted) {
        return false;
    }
    return ![
        BallState.FALLEN,
        BallState.COLLECTED,
        BallState.RETURNING,
        BallState.POCKET_CAPTURED
    ].includes(ball.state);
}
class CandidateCueRig {
    constructor(candidate) {
        this.candidate = candidate;
        const yaw = THREE.MathUtils.degToRad(candidate.yawDeg);
        const elevation = THREE.MathUtils.degToRad(candidate.elevationDeg);
        _yawQuaternion.setFromAxisAngle(Y_AXIS, yaw);
        _elevationQuaternion.setFromAxisAngle(X_AXIS, -elevation);
        _cueQuaternion.copy(_yawQuaternion).multiply(_elevationQuaternion);
        this.quaternion = _cueQuaternion.clone();
        this.hitU = candidate.hitU ?? 0;
        this.hitV = candidate.hitV ?? 0;
    }
    getShotDirectionWorld(target = new THREE.Vector3()) {
        return target.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    }
    getContactVectorWorld(target = new THREE.Vector3()) {
        const offsetX = this.hitU * BALL.RADIUS;
        const offsetY = this.hitV * BALL.RADIUS;
        const rhoSquared = offsetX * offsetX + offsetY * offsetY;
        const surfaceDistance = Math.sqrt(Math.max(0, BALL.RADIUS * BALL.RADIUS - rhoSquared));
        _localOffset.set(offsetX, offsetY, 0).applyQuaternion(this.quaternion);
        this.getShotDirectionWorld(_shotDirection);
        return target.copy(_localOffset).addScaledVector(_shotDirection, -surfaceDistance);
    }
    getElevationDeg() {
        return this.candidate.elevationDeg;
    }
    getContactOffsetNormalized() {
        return {
            u: this.hitU,
            v: this.hitV
        };
    }
}

//SHOT SIMULATOR
export class BotShotSimulator {
    constructor({ playingSurfaceSystem, railObjects, pocketObjects, playingSurfaceBox, clothY }) {
        this.playingSurfaceSystem = playingSurfaceSystem;
        this.railObjects = [...railObjects];
        this.pocketObjects = [...pocketObjects];
        this.playingSurfaceBox = playingSurfaceBox.clone();
        this.clothY = clothY;
    }
    simulate({ cueBallBody, objectBallBodies, candidate }) {
        const recorder = new ShotEventRecorder({
            maxHistory: 1
        });
        recorder.beginShot({
            shotNumber: 1,
            simulationTime: 0,
            impact: candidate
        });
        let predictionWorld = null;
        const eventSink = event => {
            recorder.record({
                ...event,
                simulationTime: event.simulationTime ?? predictionWorld?.simulationTime ?? 0
            });
        };
        const predictionPockets = new PocketSystem({
            pocketObjects: this.pocketObjects,
            clothY: this.clothY,
            eventSink
        });
        const predictionCapture = new PocketCaptureSystem({
            pocketSystem: predictionPockets,
            clothY: this.clothY
        });
        const predictionRails = new RailCollisionSystem({
            railObjects: this.railObjects,
            playingSurfaceBox: this.playingSurfaceBox,
            clothY: this.clothY,
            pocketSystem: predictionPockets,
            eventSink
        });
        predictionWorld = new PhysicsWorld({
            playingSurfaceSystem: this.playingSurfaceSystem,
            railCollisionSystem: predictionRails,
            pocketSystem: predictionPockets,
            pocketCaptureSystem: predictionCapture,
            clothY: this.clothY,
            eventSink
        });
        const sourceBodies = [
            cueBallBody,
            ...objectBallBodies
        ];
        const predictionBodies = [];
        for (const source of sourceBodies) {
            if (source !== cueBallBody && !isInPlay(source)) {
                continue;
            }
            const clone = cloneRigidBall(source);
            predictionBodies.push(clone);
            predictionWorld.addBall(clone);
        }
        const predictedCueBall = predictionBodies.find(ball => ball.label === cueBallBody.label);
        if (!predictedCueBall) {
            throw new Error("Bot simulator could not clone the cue ball.");
        }
        const candidateCue = new CandidateCueRig(candidate);
        const impactSystem = new CueImpactSystem();
        const impact = impactSystem.applyImpact(predictedCueBall, candidateCue, candidate.power);
        const maxSteps = Math.ceil(BOT_PLANNER.MAX_SIMULATION_TIME / PHYSICS.FIXED_DT);
        let simulatedTime = 0;
        for (let step = 1; step <= maxSteps; step += 1) {
            predictionWorld.step(PHYSICS.FIXED_DT);
            simulatedTime += PHYSICS.FIXED_DT;
            if (step > 12 && predictionWorld.areBallsSettled()) {
                break;
            }
        }
        const completed = recorder.endShot({
            simulationTime: simulatedTime,
            balls: predictionBodies
        });
        const finalCue = predictionBodies.find(ball => ball.label === cueBallBody.label);
        return {
            candidate: {
                ...candidate,
                elevationDeg: candidate.elevationDeg
            },
            impact,
            simulatedTime,
            summary: completed?.summary ?? {},
            events: completed?.events ?? [],
            endSnapshot: completed?.endSnapshot ?? [],
            finalCuePosition: finalCue ? {
                x: finalCue.position.x,
                y: finalCue.position.y,
                z: finalCue.position.z
            } : null,
            finalCueState: finalCue?.state ?? null
        };
    }
}
