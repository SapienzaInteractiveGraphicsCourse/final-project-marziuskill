//DEPENDENCIES
import * as THREE from "three";
import { POCKET } from "../config/constants.js";
import { EventType } from "../events/EventTypes.js";
import { objectConvexHullXZ, polygonCentroid2D, distanceSqToPolygon2D } from "../physics/Geometry2D.js";

//POCKET SYSTEM
export class PocketSystem {
    constructor({ pocketObjects, clothY, eventSink = null }) {
        this.clothY = clothY;
        this.eventSink = typeof eventSink === "function" ? eventSink : null;
        this.pockets = pocketObjects.map(object => {
            const hull = objectConvexHullXZ(object);
            if (hull.length < 3) {
                throw new Error(`Pocket "${object.name}" has an invalid projected hull.`);
            }
            const center2 = polygonCentroid2D(hull);
            return {
                name: object.name,
                object,
                hull,
                center: new THREE.Vector3(center2.x, clothY, center2.y)
            };
        });
        this.totalEntries = 0;
        this.totalPocketed = 0;
        this.lastEntry = null;
        this.lastPocketed = null;
        this.debugGroup = null;
    }
    getPockets() {
        return this.pockets;
    }
    getStats() {
        return {
            totalEntries: this.totalEntries,
            totalPocketed: this.totalPocketed,
            lastEntry: this.lastEntry,
            lastPocketed: this.lastPocketed
        };
    }
    resetStats() {
        this.totalEntries = 0;
        this.totalPocketed = 0;
        this.lastEntry = null;
        this.lastPocketed = null;
    }
    resetBall(ball) {
        ball.pocketName = null;
        ball.pocketCommitted = false;
    }
    getPocketByName(name) {
        if (!name) {
            return null;
        }
        return (this.pockets.find(pocket => pocket.name === name) ?? null);
    }
    findPocketNear(position, extraRadius = 0) {
        let best = null;
        let bestDistanceSq = Number.POSITIVE_INFINITY;
        const allowedDistanceSq = extraRadius * extraRadius;
        for (const pocket of this.pockets) {
            const distanceSq = distanceSqToPolygon2D(position.x, position.z, pocket.hull);
            if (distanceSq <= allowedDistanceSq + 1e-14 && distanceSq < bestDistanceSq) {
                best = pocket;
                bestDistanceSq = distanceSq;
            }
        }
        return best;
    }
    findPocketForUnsupportedBall(ball) {
        if (ball.pocketName) {
            return this.getPocketByName(ball.pocketName);
        }
        return this.findPocketNear(ball.position, ball.radius * POCKET.UNSUPPORTED_ASSOCIATION_MARGIN_FACTOR);
    }
    beginEntry(ball, pocket) {
        if (!pocket || ball.pocketName) {
            return;
        }
        ball.pocketName = pocket.name;
        ball.pocketCommitted = false;
        this.totalEntries += 1;
        this.lastEntry = {
            ball: ball.label,
            pocket: pocket.name,
            position: ball.position.clone()
        };
        this.eventSink?.({
            type: EventType.POCKET_ENTRY,
            ball: ball.label,
            pocket: pocket.name,
            position: {
                x: ball.position.x,
                y: ball.position.y,
                z: ball.position.z
            }
        });
    }
    cancelUncommittedEntry(ball) {
        if (ball.pocketName && !ball.pocketCommitted) {
            ball.pocketName = null;
        }
    }
    updatePocketCommit(ball) {
        if (!ball.pocketName || ball.pocketCommitted) {
            return false;
        }
        const commitY = this.clothY - ball.radius * POCKET.COMMIT_DEPTH_RADIUS_FACTOR;
        if (ball.position.y > commitY) {
            return false;
        }
        ball.pocketCommitted = true;
        this.totalPocketed += 1;
        this.lastPocketed = {
            ball: ball.label,
            pocket: ball.pocketName,
            position: ball.position.clone()
        };
        this.eventSink?.({
            type: EventType.BALL_POCKETED,
            ball: ball.label,
            pocket: ball.pocketName,
            position: {
                x: ball.position.x,
                y: ball.position.y,
                z: ball.position.z
            }
        });
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
        this.debugGroup.name = "PocketHullDebug";
        for (const pocket of this.pockets) {
            const center = pocket.center;
            const shape = new THREE.Shape();
            const first = pocket.hull[0];
            shape.moveTo(first.x - center.x, first.y - center.z);
            for (let i = 1; i < pocket.hull.length; i += 1) {
                const point = pocket.hull[i];
                shape.lineTo(point.x - center.x, point.y - center.z);
            }
            shape.closePath();
            const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
                color: 0x65f0a5,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide,
                depthTest: false
            }));
            fill.name = `PocketHullFill_${pocket.name}`;
            fill.rotation.x = Math.PI / 2;
            fill.position.set(center.x, this.clothY + 0.003, center.z);
            fill.renderOrder = 79;
            this.debugGroup.add(fill);
            const outlineGeometry = new THREE.BufferGeometry().setFromPoints(pocket.hull.map(point => new THREE.Vector3(point.x, this.clothY + 0.004, point.y)));
            const outline = new THREE.LineLoop(outlineGeometry, new THREE.LineBasicMaterial({
                color: 0x65f0a5,
                transparent: true,
                opacity: 0.95,
                depthTest: false
            }));
            outline.name = `PocketHullOutline_${pocket.name}`;
            outline.renderOrder = 80;
            this.debugGroup.add(outline);
        }
        scene.add(this.debugGroup);
    }
}
