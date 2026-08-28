import * as THREE from "three";

const bulletStyles = {
    inner: {
        geometry: new THREE.BoxGeometry(0.11, 0.11, 2.0),
        material: new THREE.MeshBasicMaterial({
            color: 0xc9822b,
            toneMapped: false
        })
    },
    outer: {
        geometry: new THREE.BoxGeometry(0.14, 0.14, 2.6),
        material: new THREE.MeshBasicMaterial({
            color: 0xb86f24,
            toneMapped: false
        })
    }
};
const bulletForward = new THREE.Vector3(0, 0, -1);

export class Bullet {
    constructor(position, direction, speed = 150, lifetime = 2.5, damage = 1, style = "inner") {
        this.direction = direction.clone().normalize();
        this.speed = speed;
        this.lifetime = lifetime;
        this.damage = damage;
        this.age = 0;
        this.alive = true;

        const appearance = bulletStyles[style] ?? bulletStyles.inner;

        this.mesh = new THREE.Mesh(
            appearance.geometry,
            appearance.material
        );

        this.mesh.position.copy(position);
        this.mesh.quaternion.setFromUnitVectors(bulletForward, this.direction);

        this.previousPosition = position.clone();
    }

    update(deltaTime) {
        if (!this.alive) return;

        this.previousPosition.copy(this.mesh.position);
        this.mesh.position.addScaledVector(this.direction, this.speed * deltaTime);
        this.age += deltaTime;

        if (this.age >= this.lifetime) {
            this.alive = false;
        }
    }

    getObject3D() {
        return this.mesh;
    }

    getPreviousPosition() {
        return this.previousPosition;
    }

    getPosition() {
        return this.mesh.position;
    }

    isAlive() {
        return this.alive;
    }

    destroy() {
        this.alive = false;
    }
}