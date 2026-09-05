import * as THREE from "three";

//BALL VISUAL
export class BilliardBall extends THREE.Group {
    constructor(ballVisual, rigidBody, { name = rigidBody.label } = {}) {
        super();
        this.name = name;
        this.body = rigidBody;
        this.visual = ballVisual;
        this.visual.name = `${name}_Visual`;
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
