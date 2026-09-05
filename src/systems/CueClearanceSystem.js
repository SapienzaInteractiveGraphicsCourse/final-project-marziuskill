//DEPENDENCIES
import * as THREE from "three";
import { BALL, CUE_RIG, CUE_CLEARANCE } from "../config/constants.js";

//GEOMETRY HELPERS
function angleDifferenceDeg(a, b) {
    let d = (a - b + 180) % 360;
    if (d < 0) {
        d += 360;
    }
    return d - 180;
}
function segmentIntersectsExpandedBox(a, b, box, expansion) {
    const min = new THREE.Vector3(box.min.x - expansion, box.min.y - expansion, box.min.z - expansion);
    const max = new THREE.Vector3(box.max.x + expansion, box.max.y + expansion, box.max.z + expansion);
    const d = new THREE.Vector3().subVectors(b, a);
    let tMin = 0;
    let tMax = 1;
    for (const axis of ["x", "y", "z"]) {
        const origin = a[axis];
        const direction = d[axis];
        if (Math.abs(direction) < 1e-10) {
            if (origin < min[axis] || origin > max[axis]) {
                return false;
            }
            continue;
        }
        let t1 = (min[axis] - origin) / direction;
        let t2 = (max[axis] - origin) / direction;
        if (t1 > t2) {
            [t1, t2] = [t2, t1];
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
            return false;
        }
    }
    return true;
}
function pointSegmentDistanceSq(point, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(point, a);
    const denom = ab.lengthSq();
    if (denom <= 1e-12) {
        return point.distanceToSquared(a);
    }
    const t = THREE.MathUtils.clamp(ap.dot(ab) / denom, 0, 1);
    const closest = a.clone().addScaledVector(ab, t);
    return point.distanceToSquared(closest);
}

//CUE CLEARANCE
export class CueClearanceSystem {
    constructor(cueRig, railObjects) {
        this.cueRig = cueRig;
        this.railObjects = [...railObjects];
        this.railBoxes = this.railObjects.map(rail => ({
            name: rail.name,
            box: new THREE.Box3().setFromObject(rail)
        }));
        this.sphereObstacles = [];
        this.minimumElevationDeg = CUE_RIG.MIN_ELEVATION_DEG;
        this.directionBlocked = false;
        this.lastCheckedYawDeg = Number.NaN;
        this.lastValidYawDeg = cueRig.getYawDeg();
        this._axisOrigin = new THREE.Vector3();
        this._axisDirection = new THREE.Vector3();
        this._segmentA = new THREE.Vector3();
        this._segmentB = new THREE.Vector3();
        this.debugGroup = null;
        this.update(true);
    }
    addSphereObstacle(object, radius = BALL.RADIUS) {
        this.sphereObstacles.push({
            object,
            radius
        });
    }
    clearSphereObstacles() {
        this.sphereObstacles.length = 0;
    }
    update(force = false) {
        const requestedYaw = this.cueRig.getYawDeg();
        if (!force && Math.abs(angleDifferenceDeg(requestedYaw, this.lastCheckedYawDeg)) < CUE_CLEARANCE.YAW_EPSILON_DEG) {
            return;
        }
        const solution = this.#findMinimumElevation(requestedYaw);
        if (solution === null) {
            this.cueRig.setYawDeg(this.lastValidYawDeg);
            const fallback = this.#findMinimumElevation(this.lastValidYawDeg);
            if (fallback === null) {
                this.directionBlocked = true;
                this.minimumElevationDeg = CUE_RIG.MAX_ELEVATION_DEG;
            }
            else {
                this.directionBlocked = false;
                this.minimumElevationDeg = fallback;
            }
        }
        else {
            this.lastValidYawDeg = requestedYaw;
            this.directionBlocked = false;
            this.minimumElevationDeg = solution;
        }
        this.lastCheckedYawDeg = this.cueRig.getYawDeg();
        this.cueRig.setClearanceState(this.minimumElevationDeg, this.directionBlocked);
    }
    getMinimumElevationDeg() {
        return this.minimumElevationDeg;
    }
    getMinimumElevationForYaw(yawDeg) {
        return this.#findMinimumElevation(yawDeg);
    }
    isDirectionBlocked() {
        return this.directionBlocked;
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
        this.debugGroup.name = "CueClearanceDebug";
        for (const entry of this.railBoxes) {
            const helper = new THREE.Box3Helper(entry.box);
            helper.name = `Collider_${entry.name}`;
            this.debugGroup.add(helper);
        }
        scene.add(this.debugGroup);
    }
    #findMinimumElevation(yawDeg) {
        const originalYaw = this.cueRig.getYawDeg();
        const originalElevation = this.cueRig.getElevationDeg();
        this.cueRig.setYawDeg(yawDeg);
        const minDeg = CUE_RIG.MIN_ELEVATION_DEG;
        const maxDeg = CUE_RIG.MAX_ELEVATION_DEG;
        if (this.#isClearAtElevation(minDeg)) {
            this.cueRig.setYawDeg(originalYaw);
            this.cueRig.setElevationDeg(originalElevation);
            return minDeg;
        }
        if (!this.#isClearAtElevation(maxDeg)) {
            this.cueRig.setYawDeg(originalYaw);
            this.cueRig.setElevationDeg(originalElevation);
            return null;
        }
        let low = minDeg;
        let high = maxDeg;
        for (let i = 0; i < CUE_CLEARANCE.BINARY_SEARCH_STEPS; i += 1) {
            const mid = 0.5 * (low + high);
            if (this.#isClearAtElevation(mid)) {
                high = mid;
            }
            else {
                low = mid;
            }
        }
        this.cueRig.setYawDeg(originalYaw);
        this.cueRig.setElevationDeg(originalElevation);
        return Math.min(maxDeg, high + CUE_CLEARANCE.ANGLE_MARGIN_DEG);
    }
    #isClearAtElevation(elevationDeg) {
        this.cueRig.setElevationDeg(elevationDeg);
        const profile = this.cueRig.getClearanceProfile();
        this.cueRig.getCueAxisWorld(this._axisOrigin, this._axisDirection);
        this._segmentA.copy(this._axisOrigin).addScaledVector(this._axisDirection, -profile.startDistance);
        this._segmentB.copy(this._axisOrigin).addScaledVector(this._axisDirection, -profile.endDistance);
        const expansion = profile.radius + CUE_CLEARANCE.MARGIN;
        for (const { box } of this.railBoxes) {
            if (segmentIntersectsExpandedBox(this._segmentA, this._segmentB, box, expansion)) {
                return false;
            }
        }
        for (const obstacle of this.sphereObstacles) {
            const center = new THREE.Vector3();
            obstacle.object.getWorldPosition(center);
            const allowedRadius = obstacle.radius + profile.radius + CUE_CLEARANCE.MARGIN;
            if (pointSegmentDistanceSq(center, this._segmentA, this._segmentB) <= allowedRadius * allowedRadius) {
                return false;
            }
        }
        return true;
    }
}
