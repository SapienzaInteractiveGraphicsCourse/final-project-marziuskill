import * as THREE from "three";

//CUE BALL VISUAL
export class CueBall extends THREE.Group {
    constructor(ballPrototype, rigidBody) {
        super();
        this.name = "CueBall";
        this.body = rigidBody;
        this.visual = ballPrototype;
        this.visual.name = "CueBallVisual";
        this.visual.position.set(0, 0, 0);
        this.visual.quaternion.identity();
        this.visual.visible = true;
        this.add(this.visual);
        this.syncFromPhysics();
    }
    syncFromPhysics() {
        this.position.copy(this.body.position);
        this.quaternion.copy(this.body.orientation);
    }
}
