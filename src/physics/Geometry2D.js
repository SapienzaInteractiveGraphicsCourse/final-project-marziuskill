//DEPENDENCIES
import * as THREE from "three";

//SCRATCH STATE
const _worldVertex = new THREE.Vector3();

//GEOMETRY HELPERS
function cross2(o, a, b) {
    return ((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
}
function quantizedKey(x, y) {
    const qx = Math.round(x * 1e7);
    const qy = Math.round(y * 1e7);
    return `${qx}:${qy}`;
}
export function collectObjectWorldXZ(object) {
    object.updateWorldMatrix(true, true);
    const points = [];
    const seen = new Set();
    object.traverse(child => {
        if (!child.isMesh || !child.geometry) {
            return;
        }
        const position = child.geometry.getAttribute("position");
        if (!position) {
            return;
        }
        child.updateWorldMatrix(true, false);
        for (let i = 0; i < position.count; i += 1) {
            _worldVertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
            const key = quantizedKey(_worldVertex.x, _worldVertex.z);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            points.push(new THREE.Vector2(_worldVertex.x, _worldVertex.z));
        }
    });
    return points;
}
export function convexHull2D(points) {
    if (points.length <= 1) {
        return points.map(p => p.clone());
    }
    const sorted = points.map(p => p.clone()).sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12) {
            lower.pop();
        }
        lower.push(point);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const point = sorted[i];
        while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12) {
            upper.pop();
        }
        upper.push(point);
    }
    lower.pop();
    upper.pop();
    return [
        ...lower,
        ...upper
    ];
}
export function objectConvexHullXZ(object) {
    return convexHull2D(collectObjectWorldXZ(object));
}
export function polygonCentroid2D(polygon) {
    if (polygon.length === 0) {
        return new THREE.Vector2();
    }
    if (polygon.length < 3) {
        const average = new THREE.Vector2();
        for (const point of polygon) {
            average.add(point);
        }
        return average.multiplyScalar(1 / polygon.length);
    }
    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const cross = a.x * b.y - b.x * a.y;
        signedArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }
    if (Math.abs(signedArea) < 1e-12) {
        const average = new THREE.Vector2();
        for (const point of polygon) {
            average.add(point);
        }
        return average.multiplyScalar(1 / polygon.length);
    }
    signedArea *= 0.5;
    const factor = 1 / (6 * signedArea);
    return new THREE.Vector2(cx * factor, cy * factor);
}
export function pointInPolygon2D(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const intersects = ((a.y > y) !== (b.y > y)) && (x < ((b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x));
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}
export function distanceSqToPolygon2D(x, y, polygon) {
    if (polygon.length === 0) {
        return Number.POSITIVE_INFINITY;
    }
    if (pointInPolygon2D(x, y, polygon)) {
        return 0;
    }
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const lengthSq = ex * ex + ey * ey;
        let t = 0;
        if (lengthSq > 1e-16) {
            t = ((x - a.x) * ex + (y - a.y) * ey) / lengthSq;
            t = Math.max(0, Math.min(1, t));
        }
        const qx = a.x + ex * t;
        const qy = a.y + ey * t;
        const dx = x - qx;
        const dy = y - qy;
        best = Math.min(best, dx * dx + dy * dy);
    }
    return best;
}
