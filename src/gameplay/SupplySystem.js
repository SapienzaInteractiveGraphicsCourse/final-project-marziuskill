import * as THREE from "three";
import {SupplyDrop} from "./SupplyDrop.js";

export class SupplySystem {
    constructor(
        scene,
        aircraftObject,
        aircraftStats,
        flightController,
        island,
        {
            oceanHeight = 0,
            crateModelPath = null
        } = {}
    ) {
        this.scene = scene;
        this.aircraft = aircraftObject;
        this.stats = aircraftStats;
        this.flightController = flightController;
        this.island = island;

        this.oceanHeight = oceanHeight;
        this.crateModelPath = crateModelPath;

        this.outposts = [];
        this.drops = [];

        this.spawnPosition = new THREE.Vector3();
        this.spawnOffset = new THREE.Vector3(0, -1.2, 0.5);
        this.worldOffset = new THREE.Vector3();

        this.forward = new THREE.Vector3();
        this.initialVelocity = new THREE.Vector3();
    }

    addOutpost(outpost) {
        if (!this.outposts.includes(outpost)) {
            this.outposts.push(outpost);
        }
    }

    tryDropSupply() {
        if (!this.flightController.isAirborne()) {
            console.log("SUPPLY DROP AVAILABLE ONLY IN FLIGHT");
            return false;
        }

        if (!this.stats.consumeSupply()) {
            console.log("NO SUPPLIES REMAINING");
            return false;
        }

        this.aircraft.getWorldPosition(this.spawnPosition);

        this.worldOffset
            .copy(this.spawnOffset)
            .applyQuaternion(this.aircraft.quaternion);

        this.spawnPosition.add(this.worldOffset);

        this.forward
            .set(0, 0, -1)
            .applyQuaternion(this.aircraft.quaternion)
            .normalize();

        this.initialVelocity
            .copy(this.forward)
            .multiplyScalar(this.flightController.getSpeed());

        this.initialVelocity.y -= 1.5;

        const drop = new SupplyDrop(this.scene, {
            position: this.spawnPosition,
            velocity: this.initialVelocity,
            crateModelPath: this.crateModelPath
        });

        this.drops.push(drop);

        console.log(`SUPPLY DROPPED - remaining: ${this.stats.supplies}`);

        return true;
    }

    _resolveDrop(drop, overWater) {
        if (drop.resolved) return;

        drop.resolved = true;

        if (overWater) {
            console.log("SUPPLY LOST: WATER");
            return;
        }

        let delivered = false;

        for (const outpost of this.outposts) {
            if (outpost.isSupplied()) continue;

            if (outpost.containsDropPosition(drop.getPosition())) {
                outpost.deliverSupply();
                delivered = true;
                break;
            }
        }

        if (!delivered) {
            console.log("SUPPLY MISSED DROP ZONE");
        }
    }

    update(deltaTime) {
        for (const drop of this.drops) {
            if (drop.isLanded()) continue;

            const position = drop.getPosition();
            const terrainHeight = this.island.getHeightAt(position.x, position.z);
            const overWater = terrainHeight <= this.oceanHeight;
            const surfaceHeight = overWater ? this.oceanHeight : terrainHeight;

            const landedNow = drop.update(deltaTime, surfaceHeight);

            if (landedNow) {
                this._resolveDrop(drop, overWater);
            }
        }
    }

    getSuppliedCount() {
        return this.outposts.filter((outpost) => outpost.isSupplied()).length;
    }

    getTotalOutposts() {
        return this.outposts.length;
    }

    allOutpostsSupplied() {
        return this.outposts.length > 0 &&
            this.outposts.every((outpost) => outpost.isSupplied());
    }
}