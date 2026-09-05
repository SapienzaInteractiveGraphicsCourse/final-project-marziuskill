//DEPENDENCIES
import * as THREE from "three";
import { POCKET_CAPTURE } from "../config/constants.js";

//SCRATCH STATE
const _sample = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _delta = new THREE.Vector3();

//HELPERS
function makeTriangleRecord(a, b, c) {
    const triangle = new THREE.Triangle(a.clone(), b.clone(), c.clone());
    return {
        triangle,
        min: new THREE.Vector3(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z)),
        max: new THREE.Vector3(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z))
    };
}

//POCKET CAPTURE
export class PocketCaptureSystem {
    constructor({ pocketSystem, clothY }) {
        if (!pocketSystem) {
            throw new Error("PocketCaptureSystem requires PocketSystem.");
        }
        this.pocketSystem = pocketSystem;
        this.clothY = clothY;
        this.walls = new Map();
        this.totalImpactCount = 0;
        this.lastImpact = null;
        this.debugGroup = null;
        this.#extractPocketWalls();
    }
    getStats() {
        return {
            throatCount: this.walls.size,
            totalImpacts: this.totalImpactCount,
            last: this.lastImpact
        };
    }
    resetStats() {
        this.totalImpactCount = 0;
        this.lastImpact = null;
    }
    noteCapture(ball, pocket, contactPosition) {
        this.totalImpactCount += 1;
        this.lastImpact = {
            ball: ball.label,
            pocket: pocket.name,
            position: contactPosition.clone()
        };
    }
    findCaptureAlongSegment(ball, fromPosition, toPosition) {
        const distance = fromPosition.distanceTo(toPosition);
        const spacing = Math.max(1e-5, ball.radius * POCKET_CAPTURE.SWEEP_SAMPLE_RADIUS_FRACTION);
        const samples = Math.min(POCKET_CAPTURE.MAX_SWEEP_SAMPLES, Math.max(1, Math.ceil(distance / spacing)));
        for (let i = 0; i <= samples; i += 1) {
            const t = samples === 0 ? 1 : i / samples;
            _sample.copy(fromPosition).lerp(toPosition, t);
            for (const pocket of this.pocketSystem.getPockets()) {
                const wall = this.walls.get(pocket.name);
                if (wall && this.#sphereTouchesWall(_sample, ball.radius, wall)) {
                    return {
                        pocket,
                        position: _sample.clone()
                    };
                }
            }
        }
        return null;
    }
    resolveBall() {
        return {
            collided: false,
            impacts: 0
        };
    }
    #sphereTouchesWall(center, radius, wall) {
        const radiusSq = radius * radius;
        if (center.x + radius < wall.bounds.min.x || center.x - radius > wall.bounds.max.x || center.y + radius < wall.bounds.min.y || center.y - radius > wall.bounds.max.y || center.z + radius < wall.bounds.min.z || center.z - radius > wall.bounds.max.z) {
            return false;
        }
        for (const record of wall.triangles) {
            if (center.x + radius < record.min.x || center.x - radius > record.max.x || center.y + radius < record.min.y || center.y - radius > record.max.y || center.z + radius < record.min.z || center.z - radius > record.max.z) {
                continue;
            }
            record.triangle.closestPointToPoint(center, _closest);
            _delta.subVectors(center, _closest);
            if (_delta.lengthSq() <= radiusSq) {
                return true;
            }
        }
        return false;
    }
    #extractPocketWalls() {
        for (const pocket of this.pocketSystem.getPockets()) {
            const triangles = [];
            const bounds = new THREE.Box3();
            bounds.makeEmpty();
            pocket.object.updateWorldMatrix(true, true);
            pocket.object.traverse(child => {
                if (!child.isMesh || !child.geometry) {
                    return;
                }
                child.updateWorldMatrix(true, false);
                const geometry = child.geometry;
                const position = geometry.getAttribute("position");
                if (!position) {
                    return;
                }
                const index = geometry.index;
                const a = new THREE.Vector3();
                const b = new THREE.Vector3();
                const c = new THREE.Vector3();
                const addTriangle = (ia, ib, ic) => {
                    a.fromBufferAttribute(position, ia).applyMatrix4(child.matrixWorld);
                    b.fromBufferAttribute(position, ib).applyMatrix4(child.matrixWorld);
                    c.fromBufferAttribute(position, ic).applyMatrix4(child.matrixWorld);
                    triangles.push(makeTriangleRecord(a, b, c));
                    bounds.expandByPoint(a);
                    bounds.expandByPoint(b);
                    bounds.expandByPoint(c);
                };
                if (index) {
                    for (let i = 0; i < index.count; i += 3) {
                        addTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
                    }
                }
                else {
                    for (let i = 0; i < position.count; i += 3) {
                        addTriangle(i, i + 1, i + 2);
                    }
                }
            });
            this.walls.set(pocket.name, {
                pocket,
                triangles,
                bounds
            });
        }
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
        const points = [];
        for (const wall of this.walls.values()) {
            for (const record of wall.triangles) {
                const { a, b, c } = record.triangle;
                points.push(a.clone(), b.clone(), b.clone(), c.clone(), c.clone(), a.clone());
            }
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.85,
            depthTest: false
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.name = "RealPocketWallDebug";
        lines.renderOrder = 92;
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = "RealPocketWallDebugGroup";
        this.debugGroup.add(lines);
        scene.add(this.debugGroup);
    }
}
