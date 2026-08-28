import * as THREE from "three";

export class DamageableTarget {
    constructor(scene, {position = new THREE.Vector3(), radius = 6, maxHealth = 40} = {}) {
        this.scene = scene;
        this.radius = radius;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.destroyed = false;
        this.hitFlashTimer = 0;

        this.root = new THREE.Group();
        this.root.position.copy(position);

        this.material = new THREE.MeshStandardMaterial({
            color: 0xaa2222,
            roughness: 0.7,
            metalness: 0
        });

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 24, 16),
            this.material
        );

        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.root.add(this.mesh);
        this.scene.add(this.root);

        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        this.worldPosition = new THREE.Vector3();
    }

    update(deltaTime) {
        if (this.destroyed) {
            return;
        }

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= deltaTime;
            this.material.color.setHex(0xffffff);
        } else {
            this.material.color.setHex(0xaa2222);
        }
    }

    takeDamage(damage) {
        if (this.destroyed) {
            return;
        }

        this.health = Math.max(0, this.health - damage);
        this.hitFlashTimer = 0.08;

        console.log(`Target HP: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.destroy();
        }
    }

    destroy() {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;
        this.scene.remove(this.root);
        console.log("Target destroyed.");
    }

    getBoundingSphere() {
        this.root.getWorldPosition(this.worldPosition);
        this.boundingSphere.center.copy(this.worldPosition);
        return this.boundingSphere;
    }

    isDestroyed() {
        return this.destroyed;
    }

    getObject3D() {
        return this.root;
    }
}