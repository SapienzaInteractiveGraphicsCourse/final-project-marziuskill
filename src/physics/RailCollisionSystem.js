//DEPENDENCIES
import * as THREE from "three";
import { CUSHION } from "../config/constants.js";
import { EventType } from "../events/EventTypes.js";
import { objectConvexHullXZ, pointInPolygon2D } from "./Geometry2D.js";

//SCRATCH STATE
const UP = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _contactR = new THREE.Vector3();
const _contactVelocity = new THREE.Vector3();
const _normalImpulse = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _tangentImpulse = new THREE.Vector3();
const _angularImpulse = new THREE.Vector3();
const _rCrossT = new THREE.Vector3();
const _velocityBefore = new THREE.Vector3();
function buildEdges(polygon, surfaceCenter) {
    const edges = [];
    for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const dx = b.x - a.x;
        const dz = b.y - a.y;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq < 1e-16) {
            continue;
        }
        const length = Math.sqrt(lengthSq);
        let nx = -dz / length;
        let nz = dx / length;
        const mx = (a.x + b.x) * 0.5;
        const mz = (a.y + b.y) * 0.5;
        if (nx * (surfaceCenter.x - mx) + nz * (surfaceCenter.z - mz) < 0) {
            nx = -nx;
            nz = -nz;
        }
        edges.push({
            a,
            b,
            dx,
            dz,
            lengthSq,
            tableNormalX: nx,
            tableNormalZ: nz
        });
    }
    return edges;
}

//RAIL COLLISIONS
export class RailCollisionSystem {
    constructor({ railObjects, playingSurfaceBox, clothY, eventSink = null }) {
        this.clothY = clothY;
        this.eventSink = typeof eventSink === "function" ? eventSink : null;
        this.activeImpactKeys = new Set();
        this.overlapsThisStep = new Set();
        this.impactEventsThisStep = new Set();
        const surfaceCenter3 = new THREE.Vector3();
        playingSurfaceBox.getCenter(surfaceCenter3);
        this.colliders = railObjects.map(rail => {
            rail.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(rail);
            const polygon = objectConvexHullXZ(rail);
            if (polygon.length < 3) {
                throw new Error(`Rail "${rail.name}" has an invalid projected hull.`);
            }
            return {
                name: rail.name,
                rail,
                polygon,
                minY: box.min.y,
                maxY: box.max.y,
                edges: buildEdges(polygon, surfaceCenter3)
            };
        });
        this.totalImpactCount = 0;
        this.lastImpact = null;
        this.debugGroup = null;
    }
    resetStats() {
        this.totalImpactCount = 0;
        this.lastImpact = null;
        this.activeImpactKeys.clear();
        this.overlapsThisStep.clear();
        this.impactEventsThisStep.clear();
    }
    beginStep() {
        this.overlapsThisStep.clear();
        this.impactEventsThisStep.clear();
    }
    endStep() {
        const nextActiveKeys = new Set();
        for (const key of this.activeImpactKeys) {
            if (this.overlapsThisStep.has(key)) {
                nextActiveKeys.add(key);
            }
        }
        for (const key of this.impactEventsThisStep) {
            if (this.overlapsThisStep.has(key)) {
                nextActiveKeys.add(key);
            }
        }
        this.activeImpactKeys = nextActiveKeys;
    }
    getStats() {
        return {
            total: this.totalImpactCount,
            last: this.lastImpact
        };
    }
    resolveBall(ball) {
        if (ball.position.y < this.clothY - ball.radius * CUSHION.ACTIVE_BELOW_CLOTH_RADIUS_FACTOR) {
            return false;
        }
        let collided = false;
        for (const collider of this.colliders) {
            if (this.#resolveBallCollider(ball, collider)) {
                collided = true;
            }
        }
        return collided;
    }
    #resolveBallCollider(ball, collider) {
        if (ball.position.y - ball.radius > collider.maxY + CUSHION.POSITION_SLOP || ball.position.y + ball.radius < collider.minY - CUSHION.POSITION_SLOP) {
            return false;
        }
        const px = ball.position.x;
        const pz = ball.position.z;
        const inside = pointInPolygon2D(px, pz, collider.polygon);
        let bestDistanceSq = Number.POSITIVE_INFINITY;
        let bestQx = 0;
        let bestQz = 0;
        let bestEdge = null;
        for (const edge of collider.edges) {
            let t = ((px - edge.a.x) * edge.dx + (pz - edge.a.y) * edge.dz) / edge.lengthSq;
            t = Math.max(0, Math.min(1, t));
            const qx = edge.a.x + edge.dx * t;
            const qz = edge.a.y + edge.dz * t;
            const dx = px - qx;
            const dz = pz - qz;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                bestQx = qx;
                bestQz = qz;
                bestEdge = edge;
            }
        }
        if (!bestEdge) {
            return false;
        }
        const radiusSq = ball.radius * ball.radius;
        if (!inside && bestDistanceSq >= radiusSq) {
            return false;
        }
        const impactKey = `${ball.label}|${collider.name}`;
        this.overlapsThisStep.add(impactKey);
        const distance = Math.sqrt(Math.max(0, bestDistanceSq));
        let penetration;
        if (!inside && distance > 1e-10) {
            _normal.set((px - bestQx) / distance, 0, (pz - bestQz) / distance);
            penetration = ball.radius - distance;
        }
        else {
            _normal.set(bestEdge.tableNormalX, 0, bestEdge.tableNormalZ);
            penetration = ball.radius + distance;
        }
        const correction = Math.max(penetration - CUSHION.POSITION_SLOP, 0) * CUSHION.POSITION_CORRECTION_PERCENT;
        if (correction > 0) {
            ball.position.addScaledVector(_normal, correction);
        }
        _contactR.copy(_normal).multiplyScalar(-ball.radius);
        _contactVelocity.crossVectors(ball.angularVelocity, _contactR).add(ball.velocity);
        const normalVelocityBefore = _contactVelocity.dot(_normal);
        if (normalVelocityBefore >= 0) {
            return true;
        }
        _velocityBefore.copy(ball.velocity);
        const closingSpeed = -normalVelocityBefore;
        const restitution = closingSpeed >= CUSHION.RESTITUTION_SPEED_THRESHOLD ? CUSHION.RESTITUTION : 0;
        const jn = -(1 + restitution) * normalVelocityBefore / ball.invMass;
        _normalImpulse.copy(_normal).multiplyScalar(jn);
        ball.applyLinearImpulse(_normalImpulse);
        _contactVelocity.crossVectors(ball.angularVelocity, _contactR).add(ball.velocity);
        _tangent.crossVectors(UP, _normal);
        if (_tangent.lengthSq() > 1e-12) {
            _tangent.normalize();
        }
        const tangentVelocityBefore = _contactVelocity.dot(_tangent);
        _rCrossT.crossVectors(_contactR, _tangent);
        const tangentEffectiveInverseMass = ball.invMass + _rCrossT.lengthSq() * ball.invInertia;
        let jt = 0;
        if (tangentEffectiveInverseMass > 0) {
            const jtStop = -tangentVelocityBefore / tangentEffectiveInverseMass;
            const maxJt = CUSHION.TANGENTIAL_FRICTION_COEFFICIENT * Math.abs(jn);
            jt = THREE.MathUtils.clamp(jtStop, -maxJt, maxJt);
            _tangentImpulse.copy(_tangent).multiplyScalar(jt);
            ball.applyLinearImpulse(_tangentImpulse);
            _angularImpulse.crossVectors(_contactR, _tangentImpulse);
            ball.applyAngularImpulse(_angularImpulse);
        }
        this.totalImpactCount += 1;
        this.lastImpact = {
            ball: ball.label,
            rail: collider.name,
            normalImpulse: Math.abs(jn),
            tangentImpulse: jt,
            closingSpeed,
            restitution,
            tangentSpeed: tangentVelocityBefore,
            normal: _normal.clone(),
            velocityBefore: _velocityBefore.clone(),
            velocityAfter: ball.velocity.clone(),
            omegaYAfter: ball.angularVelocity.y
        };
        if (!this.activeImpactKeys.has(impactKey) && !this.impactEventsThisStep.has(impactKey)) {
            this.impactEventsThisStep.add(impactKey);
            this.eventSink?.({
                type: EventType.RAIL_CONTACT,
                ball: ball.label,
                rail: collider.name,
                position: {
                    x: ball.position.x,
                    y: ball.position.y,
                    z: ball.position.z
                },
                normalImpulse: Math.abs(jn),
                tangentImpulse: jt,
                closingSpeed,
                normal: {
                    x: _normal.x,
                    y: _normal.y,
                    z: _normal.z
                }
            });
        }
        return true;
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
        this.debugGroup.name = "RailProfileDebug";
        for (const collider of this.colliders) {
            const geometry = new THREE.BufferGeometry().setFromPoints(collider.polygon.map(point => new THREE.Vector3(point.x, this.clothY + 0.006, point.y)));
            const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                color: 0xffd34d,
                transparent: true,
                opacity: 0.95,
                depthTest: false
            }));
            line.name = `RailProfile_${collider.name}`;
            line.renderOrder = 81;
            this.debugGroup.add(line);
        }
        scene.add(this.debugGroup);
    }
}
