import * as THREE from "three";

//PLAYING SURFACE
export class PlayingSurfaceSystem {
    constructor(playingSurface) {
        this.playingSurface = playingSurface;
        this.raycaster = new THREE.Raycaster();
        this.down = new THREE.Vector3(0, -1, 0);
        this._origin = new THREE.Vector3();
    }
    getSupportBelow(worldPosition, maxDistance = 0.2) {
        this._origin.copy(worldPosition);
        this.raycaster.set(this._origin, this.down);
        this.raycaster.near = 0;
        this.raycaster.far = maxDistance;
        const hits = this.raycaster.intersectObject(this.playingSurface, true);
        return hits.length > 0 ? hits[0] : null;
    }
    hasSupportBelow(worldPosition, maxDistance = 0.2) {
        return this.getSupportBelow(worldPosition, maxDistance) !== null;
    }
}
