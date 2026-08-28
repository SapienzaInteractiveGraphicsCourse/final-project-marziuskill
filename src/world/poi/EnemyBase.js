import * as THREE from "three";

export class EnemyBase {
    constructor(scene, {name = "Enemy Base", position = new THREE.Vector3(), maxHealth = 240, radius = 14} = {}) {
        this.scene = scene;
        this.name = name;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.radius = radius;
        this.destroyed = false;

        this.root = new THREE.Group();
        this.root.name = name;
        this.root.position.copy(position);

        this.material = new THREE.MeshStandardMaterial({
            color: 0x6b4038,
            roughness: 0.8,
            metalness: 0.15
        });

        const bunker = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 12), this.material);
        bunker.position.y = 2.5;
        bunker.castShadow = true;
        bunker.receiveShadow = true;
        this.root.add(bunker);

        const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 9, 12), this.material);
        tower.position.set(6, 4.5, -4);
        tower.castShadow = true;
        tower.receiveShadow = true;
        this.root.add(tower);

        const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 10, 8),
            new THREE.MeshStandardMaterial({color: 0x999999, metalness: 0.7, roughness: 0.35})
        );
        antenna.position.set(6, 13, -4);
        antenna.castShadow = true;
        this.root.add(antenna);

        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        this.worldPosition = new THREE.Vector3();

        scene.add(this.root);
    }

    takeDamage(amount) {
        if (this.destroyed) return;

        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name}: ${this.health}/${this.maxHealth} HP`);

        if (this.health <= 0) this.destroy();
    }

    destroy() {
        if (this.destroyed) return;

        this.destroyed = true;
        this.scene.remove(this.root);

        console.log(`ENEMY BASE DESTROYED: ${this.name}`);
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