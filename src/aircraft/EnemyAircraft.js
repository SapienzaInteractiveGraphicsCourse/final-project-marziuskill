import * as THREE from "three";
import {AircraftModel} from "./AircraftModel.js";
import {AircraftStats} from "./AircraftStats.js";

export class EnemyAircraft {
    constructor(scene, {
        position = new THREE.Vector3(),
        maxHealth = 100
    } = {}) {
        this.scene = scene;

        this.model = new AircraftModel({faction: "enemy"});
        this.stats = new AircraftStats({maxHealth});

        this.root = this.model.getObject3D();
        this.root.position.copy(position);

        this.destroyed = false;
        this.boundingSphere = new THREE.Sphere();

        this.scene.add(this.root);
    }

    update(deltaTime) {
        if (this.destroyed) return;

        this.model.update(deltaTime);
    }

    takeDamage(amount) {
        if (this.destroyed) return;

        const destroyed = this.stats.takeDamage(amount);

        console.log(`Enemy Fighter HP: ${this.stats.health}/${this.stats.maxHealth}`);

        if (destroyed) this.destroy();
    }

    destroy() {
        if (this.destroyed) return;

        this.destroyed = true;
        this.scene.remove(this.root);

        console.log("ENEMY FIGHTER DESTROYED");
    }

    getHitSpheres() {
        return this.model.getHitSpheres();
    }

    toggleHitboxDebug() {
        return this.model.toggleHitboxDebug();
    }

    isDestroyed() {
        return this.destroyed;
    }

    getObject3D() {
        return this.root;
    }

    getModel() {
        return this.model;
    }

    getStats() {
        return this.stats;
    }
}