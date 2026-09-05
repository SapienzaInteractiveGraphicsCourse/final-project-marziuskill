//DEPENDENCIES
import * as THREE from "three";
import { BALL_RETURN } from "../config/constants.js";

//SCRATCH STATE
const _center = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _desiredVelocity = new THREE.Vector3();
const _currentVelocity = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _rollingOmega = new THREE.Vector3();
const _rollingVelocity = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
function planarDistance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

//BALL RETURN
export class BallReturnCollisionSystem {
    constructor({ ballReturnObject, pocketSystem }) {
        if (!ballReturnObject) {
            throw new Error("Simple BallReturn requires the BallReturn asset.");
        }
        if (!pocketSystem) {
            throw new Error("Simple BallReturn requires PocketSystem.");
        }
        this.object = ballReturnObject;
        this.pocketSystem = pocketSystem;
        this.object.updateWorldMatrix(true, true);
        this.bounds = new THREE.Box3().setFromObject(this.object);
        this.bounds.getCenter(_center);
        const extentX = this.bounds.max.x - this.bounds.min.x;
        const extentZ = this.bounds.max.z - this.bounds.min.z;
        this.longAxis = extentX >= extentZ ? "x" : "z";
        this.shortAxis = this.longAxis === "x" ? "z" : "x";
        this.targets = new Map();
        this.totalCollected = 0;
        this.lastCollected = null;
        this.lastGuide = null;
        this.debugGroup = null;
        this.#buildTargets();
    }
    getStats() {
        return {
            triangleCount: 2,
            totalImpacts: this.totalCollected,
            last: this.lastCollected,
            lastGuide: this.lastGuide
        };
    }
    resetStats() {
        this.totalCollected = 0;
        this.lastCollected = null;
        this.lastGuide = null;
    }
    prepareBall(ball) {
        if (ball.returnTargetId) {
            return;
        }
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const target of this.targets.values()) {
            const distance = planarDistance(ball.position, target.position);
            if (distance < bestDistance) {
                best = target;
                bestDistance = distance;
            }
        }
        if (!best) {
            return;
        }
        ball.returnTargetId = best.id;
        ball.returnStage = "LONG";
        ball.returnLaneCoordinate = ball.position[this.shortAxis];
        const pocket = this.pocketSystem.getPocketByName(ball.pocketName);
        const floorY = this.#findFloorY(pocket?.center ?? ball.position);
        ball.returnFloorY = floorY;
        this.lastGuide = {
            ball: ball.label,
            side: best.id,
            stage: "DROP",
            distance: bestDistance,
            acceleration: 0
        };
    }
    getTarget(id) {
        return (this.targets.get(id) ?? null);
    }
    advanceBall(ball, dt, allBalls) {
        this.prepareBall(ball);
        const target = this.getTarget(ball.returnTargetId);
        if (!target) {
            return;
        }
        ball.position.y = ball.returnFloorY + ball.radius;
        ball.velocity.y = 0;
        const longAxis = this.longAxis;
        const shortAxis = this.shortAxis;
        if (ball.returnStage === "LONG" && Number.isFinite(ball.returnLaneCoordinate)) {
            ball.position[shortAxis] = ball.returnLaneCoordinate;
        }
        const longDelta = target.position[longAxis] - ball.position[longAxis];
        if (ball.returnStage === "LONG" && Math.abs(longDelta) <= BALL_RETURN.AXIS_SWITCH_TOLERANCE) {
            ball.position[longAxis] = target.position[longAxis];
            ball.velocity.set(0, 0, 0);
            ball.returnStage = "SHORT";
        }
        const activeAxis = ball.returnStage === "LONG" ? longAxis : shortAxis;
        if (ball.returnStage === "SHORT") {
            ball.position[longAxis] = target.position[longAxis];
        }
        const delta = target.position[activeAxis] - ball.position[activeAxis];
        if (Math.abs(delta) <= BALL_RETURN.TARGET_CAPTURE_RADIUS) {
            ball.position[activeAxis] = target.position[activeAxis];
            ball.velocity.set(0, 0, 0);
            if (ball.returnStage === "LONG") {
                ball.returnStage = "SHORT";
                return;
            }
            this.#collectBall(ball, target, "TARGET");
            return;
        }
        const direction = Math.sign(delta);
        const distance = Math.abs(delta);
        const desiredSpeed = Math.min(BALL_RETURN.MAX_SPEED, Math.sqrt(2 * BALL_RETURN.ACCELERATION * distance));
        const currentSpeed = ball.velocity[activeAxis];
        const desiredAxisVelocity = direction * desiredSpeed;
        let dv = desiredAxisVelocity - currentSpeed;
        const maxDv = BALL_RETURN.ACCELERATION * dt;
        dv = THREE.MathUtils.clamp(dv, -maxDv, maxDv);
        ball.velocity.x = 0;
        ball.velocity.z = 0;
        ball.velocity[activeAxis] = currentSpeed + dv;
        const previousCoordinate = ball.position[activeAxis];
        ball.position[activeAxis] += ball.velocity[activeAxis] * dt;
        const crossedTarget = (target.position[activeAxis] - previousCoordinate) * (target.position[activeAxis] - ball.position[activeAxis]) <= 0;
        if (crossedTarget) {
            ball.position[activeAxis] = target.position[activeAxis];
            ball.velocity.set(0, 0, 0);
            if (ball.returnStage === "LONG") {
                ball.returnStage = "SHORT";
            }
        }
        const actualAxisDisplacement = ball.position[activeAxis] - previousCoordinate;
        _rollingVelocity.set(0, 0, 0);
        if (dt > 0) {
            _rollingVelocity[activeAxis] = actualAxisDisplacement / dt;
        }
        _rollingOmega.crossVectors(_up, _rollingVelocity).multiplyScalar(1 / ball.radius);
        ball.angularVelocity.copy(_rollingOmega);
        ball.integrateOrientation(dt);
        for (const other of allBalls) {
            if (other === ball || !other.pocketCommitted || other.returnTargetId !== ball.returnTargetId || (other.state !== "RETURNING" && other.state !== "COLLECTED")) {
                continue;
            }
            const dx = ball.position.x - other.position.x;
            const dz = ball.position.z - other.position.z;
            const separation = Math.hypot(dx, dz);
            const minSeparation = ball.radius + other.radius + BALL_RETURN.BALL_BLOCK_SLOP;
            if (separation < minSeparation) {
                let nx = dx;
                let nz = dz;
                let length = separation;
                if (length < 1e-10) {
                    nx = activeAxis === "x" ? -direction : 0;
                    nz = activeAxis === "z" ? -direction : 0;
                    length = 1;
                }
                nx /= length;
                nz /= length;
                ball.position.x = other.position.x + nx * minSeparation;
                ball.position.z = other.position.z + nz * minSeparation;
                this.#collectBall(ball, target, "BLOCKED_BY_BALL");
                return;
            }
        }
        if (ball.returnStage === "SHORT") {
            const shortDistance = Math.abs(target.position[shortAxis] - ball.position[shortAxis]);
            if (shortDistance <= BALL_RETURN.TARGET_CAPTURE_RADIUS) {
                ball.position[shortAxis] = target.position[shortAxis];
                this.#collectBall(ball, target, "TARGET");
                return;
            }
        }
        const remainingDistance = ball.returnStage === "LONG" ? Math.abs(target.position[longAxis] - ball.position[longAxis]) + Math.abs(target.position[shortAxis] - ball.position[shortAxis]) : Math.abs(target.position[shortAxis] - ball.position[shortAxis]);
        this.lastGuide = {
            ball: ball.label,
            side: target.id,
            stage: ball.returnStage,
            distance: remainingDistance,
            acceleration: BALL_RETURN.ACCELERATION
        };
    }
    #collectBall(ball, target, reason) {
        const wasCollected = ball.state === "COLLECTED";
        ball.velocity.set(0, 0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.state = "COLLECTED";
        ball.frictionRegime = "RETURN_REST";
        if (!wasCollected) {
            this.totalCollected += 1;
            this.lastCollected = {
                ball: ball.label,
                floorY: ball.returnFloorY,
                reason,
                target: target.id
            };
        }
        this.lastGuide = {
            ball: ball.label,
            side: target.id,
            stage: "COLLECTED",
            distance: planarDistance(ball.position, target.position),
            acceleration: 0
        };
    }
    #findFloorY(position) {
        const searchStartY = Math.min(position.y, this.bounds.max.y);
        _rayOrigin.set(position.x, searchStartY, position.z);
        _raycaster.set(_rayOrigin, DOWN);
        const hits = _raycaster.intersectObject(this.object, true);
        for (const hit of hits) {
            if (hit.point.y < searchStartY - 1e-5) {
                return hit.point.y;
            }
        }
        return this.bounds.min.y;
    }
    #buildTargets() {
        const nearNames = [
            "Pocket_Left_Near",
            "Pocket_Right_Near"
        ];
        const farNames = [
            "Pocket_Left_Far",
            "Pocket_Right_Far"
        ];
        const averageAxis = (names, axis) => {
            let sum = 0;
            let count = 0;
            for (const name of names) {
                const pocket = this.pocketSystem.getPocketByName(name);
                if (pocket) {
                    sum += pocket.center[axis];
                    count += 1;
                }
            }
            return count > 0 ? sum / count : 0;
        };
        const nearLong = averageAxis(nearNames, this.longAxis);
        const farLong = averageAxis(farNames, this.longAxis);
        const nearPositive = nearLong > farLong;
        const shortCenter = (this.bounds.min[this.shortAxis] + this.bounds.max[this.shortAxis]) * 0.5;
        const nearLongTarget = nearPositive ? this.bounds.max[this.longAxis] - BALL_RETURN.TARGET_INSET : this.bounds.min[this.longAxis] + BALL_RETURN.TARGET_INSET;
        const farLongTarget = nearPositive ? this.bounds.min[this.longAxis] + BALL_RETURN.TARGET_INSET : this.bounds.max[this.longAxis] - BALL_RETURN.TARGET_INSET;
        const makeProbe = longCoordinate => {
            const probe = new THREE.Vector3(_center.x, this.bounds.max.y, _center.z);
            probe[this.longAxis] = longCoordinate;
            probe[this.shortAxis] = shortCenter;
            return probe;
        };
        const nearProbe = makeProbe(nearLongTarget);
        const farProbe = makeProbe(farLongTarget);
        const nearPosition = nearProbe.clone();
        const farPosition = farProbe.clone();
        nearPosition.y = this.#findFloorY(nearProbe);
        farPosition.y = this.#findFloorY(farProbe);
        this.targets.set("NEAR", {
            id: "NEAR",
            position: nearPosition
        });
        this.targets.set("FAR", {
            id: "FAR",
            position: farPosition
        });
    }
    setDebugVisible(scene, visible) {
        if (!visible) {
            if (this.debugGroup) {
                scene.remove(this.debugGroup);
                this.debugGroup.traverse(child => {
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                });
                this.debugGroup = null;
            }
            return;
        }
        if (this.debugGroup) {
            return;
        }
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = "SimpleBallReturnDebug";
        for (const target of this.targets.values()) {
            const geometry = new THREE.SphereGeometry(0.035, 12, 8);
            const material = new THREE.MeshBasicMaterial({
                wireframe: true,
                transparent: true,
                opacity: 0.95,
                depthTest: false
            });
            const marker = new THREE.Mesh(geometry, material);
            marker.name = `ReturnTarget_${target.id}`;
            marker.position.copy(target.position);
            marker.renderOrder = 91;
            this.debugGroup.add(marker);
        }
        scene.add(this.debugGroup);
    }
}
