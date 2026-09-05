//Runs an isolated prediction simulation and renders the resulting cue-ball trajectory.

//DEPENDENCIES
import * as THREE from "three";
import { BALL, PHYSICS, TRAJECTORY_HELPER } from "../config/constants.js";
import { RigidBall, BallState } from "../physics/RigidBall.js";
import { PhysicsWorld } from "../physics/PhysicsWorld.js";
import { RailCollisionSystem } from "../physics/RailCollisionSystem.js";
import { CueImpactSystem } from "../physics/CueImpactSystem.js";
import { PocketCaptureSystem } from "../physics/PocketCaptureSystem.js";
import { PocketSystem } from "./PocketSystem.js";

//PREDICTION HELPERS
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
    return clone;
}
function isPredictionObstacle(body) {
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
function horizontalDistance(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z);
}
function allPredictionBallsSettled(balls) {
    return balls.every(ball => {
        if (ball.state === BallState.FALLEN) {
            return true;
        }
        return (ball.velocity.lengthSq() <= PHYSICS.REST_LINEAR_EPSILON * PHYSICS.REST_LINEAR_EPSILON && ball.angularVelocity.lengthSq() <= PHYSICS.REST_ANGULAR_EPSILON * PHYSICS.REST_ANGULAR_EPSILON);
    });
}

//TRAJECTORY PREVIEW
export class TrajectoryPreviewSystem {

    //INITIALIZATION
    constructor({ scene, cueRig, shotSystem, cueBallBody, objectBallBodies, playingSurfaceSystem, railObjects, pocketObjects, playingSurfaceBox, clothY }) {
        this.scene = scene;
        this.cueRig = cueRig;
        this.shotSystem = shotSystem;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.playingSurfaceSystem = playingSurfaceSystem;
        this.railObjects = railObjects;
        this.pocketObjects = pocketObjects;
        this.playingSurfaceBox = playingSurfaceBox.clone();
        this.clothY = clothY;
        this.enabled = TRAJECTORY_HELPER.ENABLED_BY_DEFAULT;
        this.lastSignature = null;
        this.lastRebuildTime = -Infinity;
        this.forceRebuild = true;
        this.stats = {
            visible: false,
            simulatedTime: 0,
            pathLength: 0,
            pointCount: 0,
            maxLateralDeviation: 0,
            finalState: "—",
            finalPocket: "—",
            ballCollisionCount: 0,
            railCollisionCount: 0,
            pocketEntryCount: 0
        };
        this.group = new THREE.Group();
        this.group.name = "TrajectoryPreviewHelper";
        this.lineGeometry = new THREE.BufferGeometry();
        this.lineMaterial = new THREE.LineDashedMaterial({
            color: 0x87e6ff,
            transparent: true,
            opacity: 0.88,
            dashSize: 0.035,
            gapSize: 0.018,
            depthTest: false
        });
        this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
        this.line.name = "PredictedCueBallTrajectory";
        this.line.renderOrder = 50;
        this.group.add(this.line);
        this.endpointMaterial = new THREE.MeshBasicMaterial({
            color: 0x87e6ff,
            transparent: true,
            opacity: 0.34,
            wireframe: true,
            depthTest: false
        });
        this.endpoint = new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS, 18, 12), this.endpointMaterial);
        this.endpoint.name = "PredictedCueBallEndpoint";
        this.endpoint.renderOrder = 51;
        this.endpoint.visible = false;
        this.group.add(this.endpoint);
        this.ballMarkerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffb454,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        this.railMarkerMaterial = new THREE.MeshBasicMaterial({
            color: 0xc9a1ff,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        this.pocketMarkerMaterial = new THREE.MeshBasicMaterial({
            color: 0x65f0a5,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        this.markerGeometry = new THREE.SphereGeometry(BALL.RADIUS * 0.22, 10, 8);
        this.markerGroup = new THREE.Group();
        this.markerGroup.name = "TrajectoryCollisionMarkers";
        this.group.add(this.markerGroup);
        this.scene.add(this.group);
        this.group.visible = false;
    }

    //PUBLIC CONTROL
    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.group.visible = false;
            this.stats.visible = false;
        }
        else {
            this.invalidate();
        }
    }
    isEnabled() {
        return this.enabled;
    }
    invalidate() {
        this.forceRebuild = true;
    }
    getStats() {
        return {
            ...this.stats
        };
    }

    //UPDATE LOOP
    update(nowSeconds) {
        if (!this.enabled || !this.#canPreview()) {
            this.group.visible = false;
            this.stats.visible = false;
            return;
        }
        const signature = this.#makeSignature();
        const changed = signature !== this.lastSignature;
        if (!this.forceRebuild && !changed) {
            this.group.visible = true;
            this.stats.visible = true;
            return;
        }
        if (!this.forceRebuild && nowSeconds - this.lastRebuildTime < TRAJECTORY_HELPER.MIN_REBUILD_INTERVAL) {
            return;
        }
        this.#rebuild();
        this.lastSignature = signature;
        this.lastRebuildTime = nowSeconds;
        this.forceRebuild = false;
    }
    dispose() {
        this.scene.remove(this.group);
        this.lineGeometry.dispose();
        this.lineMaterial.dispose();
        this.endpoint.geometry.dispose();
        this.endpointMaterial.dispose();
        this.markerGeometry.dispose();
        this.ballMarkerMaterial.dispose();
        this.railMarkerMaterial.dispose();
        this.pocketMarkerMaterial.dispose();
    }

    //ELIGIBILITY
    #canPreview() {
        return (!this.shotSystem.strokeStarted && !this.shotSystem.hasCommittedShot() && this.shotSystem.canShoot());
    }

    //CACHE SIGNATURE
    #makeSignature() {
        const hit = this.shotSystem.getHitOffset();
        const parts = [
            this.cueRig.getYawDeg().toFixed(3),
            this.cueRig.getElevationDeg().toFixed(3),
            this.shotSystem.getPower().toFixed(4),
            hit.u.toFixed(4),
            hit.v.toFixed(4)
        ];
        const bodies = [
            this.cueBallBody,
            ...this.objectBallBodies
        ];
        for (const body of bodies) {
            if (body !== this.cueBallBody && !isPredictionObstacle(body)) {
                continue;
            }
            parts.push(body.position.x.toFixed(4), body.position.y.toFixed(4), body.position.z.toFixed(4), body.velocity.x.toFixed(4), body.velocity.y.toFixed(4), body.velocity.z.toFixed(4), body.angularVelocity.x.toFixed(3), body.angularVelocity.y.toFixed(3), body.angularVelocity.z.toFixed(3), body.state);
        }
        return parts.join("|");
    }

    //MARKERS
    #clearMarkers() {
        while (this.markerGroup.children.length > 0) {
            const child = this.markerGroup.children[this.markerGroup.children.length - 1];
            this.markerGroup.remove(child);
        }
    }
    #addMarker(position, type) {
        if (this.markerGroup.children.length >= TRAJECTORY_HELPER.MAX_COLLISION_MARKERS) {
            return;
        }
        const marker = new THREE.Mesh(this.markerGeometry, type === "rail" ? this.railMarkerMaterial : (type === "pocket" ? this.pocketMarkerMaterial : this.ballMarkerMaterial));
        marker.position.copy(position);
        marker.renderOrder = 52;
        this.markerGroup.add(marker);
    }

    //PREDICTION
    //Prediction uses cloned rigid bodies so preview simulation can never mutate the live match.
    #rebuild() {
        const predictionPockets = new PocketSystem({
            pocketObjects: this.pocketObjects,
            clothY: this.clothY
        });
        const predictionCapture = new PocketCaptureSystem({
            pocketSystem: predictionPockets,
            clothY: this.clothY
        });
        const predictionRails = new RailCollisionSystem({
            railObjects: this.railObjects,
            playingSurfaceBox: this.playingSurfaceBox,
            clothY: this.clothY,
            pocketSystem: predictionPockets
        });
        const predictionWorld = new PhysicsWorld({
            playingSurfaceSystem: this.playingSurfaceSystem,
            railCollisionSystem: predictionRails,
            pocketSystem: predictionPockets,
            pocketCaptureSystem: predictionCapture,
            clothY: this.clothY
        });
        const sourceBodies = [
            this.cueBallBody,
            ...this.objectBallBodies.filter(isPredictionObstacle)
        ];
        const predictionBodies = sourceBodies.map(cloneRigidBall);
        for (const body of predictionBodies) {
            predictionWorld.addBall(body);
        }
        const predictedCueBall = predictionBodies[0];
        const previewImpactSystem = new CueImpactSystem();
        previewImpactSystem.applyImpact(predictedCueBall, this.cueRig, this.shotSystem.getPower());
        const lateralReferenceOrigin = predictedCueBall.position.clone();
        const initialHorizontalDirection = new THREE.Vector3(predictedCueBall.velocity.x, 0, predictedCueBall.velocity.z);
        if (initialHorizontalDirection.lengthSq() > 1e-12) {
            initialHorizontalDirection.normalize();
        }
        else {
            initialHorizontalDirection.set(0, 0, 1);
        }
        const lateralAxis = new THREE.Vector3(-initialHorizontalDirection.z, 0, initialHorizontalDirection.x);
        let maxLateralDeviation = 0;
        let signedMaxLateralDeviation = 0;
        const points = [
            predictedCueBall.position.clone()
        ];
        this.#clearMarkers();
        let simulatedTime = 0;
        let pathLength = 0;
        let lastRecordedPoint = points[0];
        let previousBallImpacts = predictionWorld.getCollisionStats().total;
        let previousRailImpacts = predictionWorld.getRailCollisionStats().total;
        let cueBallCollisionCount = 0;
        let cueRailCollisionCount = 0;
        let previousPocketEntries = predictionWorld.getPocketStats().totalEntries;
        let cuePocketEntryCount = 0;
        const maxSteps = Math.ceil(TRAJECTORY_HELPER.MAX_SIMULATION_TIME / PHYSICS.FIXED_DT);
        for (let step = 1; step <= maxSteps; step += 1) {
            predictionWorld.step(PHYSICS.FIXED_DT);
            simulatedTime += PHYSICS.FIXED_DT;
            const ballStats = predictionWorld.getCollisionStats();
            if (ballStats.total > previousBallImpacts) {
                previousBallImpacts = ballStats.total;
                const last = ballStats.last;
                if (last && (last.a === predictedCueBall.label || last.b === predictedCueBall.label)) {
                    cueBallCollisionCount += 1;
                    this.#addMarker(predictedCueBall.position, "ball");
                }
            }
            const railStats = predictionWorld.getRailCollisionStats();
            if (railStats.total > previousRailImpacts) {
                previousRailImpacts = railStats.total;
                const last = railStats.last;
                if (last && last.ball === predictedCueBall.label) {
                    cueRailCollisionCount += 1;
                    this.#addMarker(predictedCueBall.position, "rail");
                }
            }
            const pocketStats = predictionWorld.getPocketStats();
            if (pocketStats.totalEntries > previousPocketEntries) {
                previousPocketEntries = pocketStats.totalEntries;
                const last = pocketStats.lastEntry;
                if (last && last.ball === predictedCueBall.label) {
                    cuePocketEntryCount += 1;
                    this.#addMarker(predictedCueBall.position, "pocket");
                }
            }
            const shouldSample = step % TRAJECTORY_HELPER.SAMPLE_EVERY_STEPS === 0;
            if (shouldSample) {
                const sample = predictedCueBall.position.clone();
                const lateralDx = sample.x - lateralReferenceOrigin.x;
                const lateralDz = sample.z - lateralReferenceOrigin.z;
                const signedLateral = lateralDx * lateralAxis.x + lateralDz * lateralAxis.z;
                if (Math.abs(signedLateral) > maxLateralDeviation) {
                    maxLateralDeviation = Math.abs(signedLateral);
                    signedMaxLateralDeviation = signedLateral;
                }
                if (sample.y >= this.clothY) {
                    sample.y += TRAJECTORY_HELPER.VISUAL_Y_OFFSET;
                }
                pathLength += horizontalDistance(lastRecordedPoint, sample);
                points.push(sample);
                lastRecordedPoint = sample;
            }
            if (predictedCueBall.pocketCommitted || predictedCueBall.state === BallState.FALLEN) {
                break;
            }
            if (step > 12 && allPredictionBallsSettled(predictionBodies)) {
                break;
            }
        }
        const exactEndpoint = predictedCueBall.position.clone();
        {
            const lateralDx = exactEndpoint.x - lateralReferenceOrigin.x;
            const lateralDz = exactEndpoint.z - lateralReferenceOrigin.z;
            const signedLateral = lateralDx * lateralAxis.x + lateralDz * lateralAxis.z;
            if (Math.abs(signedLateral) > maxLateralDeviation) {
                maxLateralDeviation = Math.abs(signedLateral);
                signedMaxLateralDeviation = signedLateral;
            }
        }
        if (exactEndpoint.y >= this.clothY) {
            exactEndpoint.y += TRAJECTORY_HELPER.VISUAL_Y_OFFSET;
        }
        if (points.length === 0 || points[points.length - 1].distanceToSquared(exactEndpoint) > 1e-10) {
            pathLength += horizontalDistance(lastRecordedPoint, exactEndpoint);
            points.push(exactEndpoint);
        }
        const nextLineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        this.lineGeometry.dispose();
        this.lineGeometry = nextLineGeometry;
        this.line.geometry = this.lineGeometry;
        this.line.computeLineDistances();
        this.endpoint.position.copy(exactEndpoint);
        this.endpoint.visible = true;
        this.group.visible = true;
        this.stats = {
            visible: true,
            simulatedTime,
            pathLength,
            pointCount: points.length,
            maxLateralDeviation,
            signedMaxLateralDeviation,
            finalState: predictedCueBall.state,
            finalPocket: predictedCueBall.pocketName ?? "—",
            ballCollisionCount: cueBallCollisionCount,
            railCollisionCount: cueRailCollisionCount,
            pocketEntryCount: cuePocketEntryCount
        };
    }
}
