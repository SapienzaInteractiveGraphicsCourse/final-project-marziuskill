import * as THREE from "three";

export class AircraftCollision {
    constructor(aircraftModel, flightController, aircraftStats, island, oceanHeight = 0) {
        this.aircraftModel = aircraftModel;
        this.aircraft = aircraftModel.getObject3D();
        this.flightController = flightController;
        this.aircraftStats = aircraftStats;
        this.island = island;
        this.oceanHeight = oceanHeight;

        this.gearDownClearance = 1.5;
        this.gearUpClearance = 0.8;

        this.maxLandingSpeed = 10;
        this.maxHardLandingSpeed = 14;
        this.maxLandingVerticalSpeed = 3.5;
        this.maxHardLandingVerticalSpeed = 6.5;

        this.maxLandingPitch = 18;
        this.maxLandingRoll = 20;
        this.maxHardLandingPitch = 25;
        this.maxHardLandingRoll = 30;

        this.hardLandingDamage = 25;

        this.targets = [];
        this.runways = [];

        this.euler = new THREE.Euler();

        this.previousY = this.aircraft.position.y;
        this.verticalSpeed = 0;

        this.crashed = false;

        this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    }

    addTarget(target) {
        if (!this.targets.includes(target)) {
            this.targets.push(target);
        }
    }

    removeTarget(target) {
        const index = this.targets.indexOf(target);
        if (index !== -1) this.targets.splice(index, 1);
    }

    addRunway(runway) {
        if (!this.runways.includes(runway)) {
            this.runways.push(runway);
        }
    }

    _getTerrainNormal(x, z) {
        const sample = 2;

        const hLeft = this.island.getHeightAt(x - sample, z);
        const hRight = this.island.getHeightAt(x + sample, z);
        const hBack = this.island.getHeightAt(x, z - sample);
        const hFront = this.island.getHeightAt(x, z + sample);

        this.surfaceNormal.set(hLeft - hRight, sample * 2, hBack - hFront).normalize();

        return this.surfaceNormal;
    }

    _getSurface(x, z) {
        for (const runway of this.runways) {
            if (runway.containsPoint(x, z)) {
                return {
                    height: runway.getSurfaceHeight(),
                    type: "runway",
                    normal: new THREE.Vector3(0, 1, 0),
                    runway
                };
            }
        }

        const terrainHeight = this.island.getHeightAt(x, z);

        if (terrainHeight <= this.oceanHeight) {
            return {
                height: this.oceanHeight,
                type: "water",
                normal: new THREE.Vector3(0, 1, 0),
                runway: null
            };
        }

        return {
            height: terrainHeight,
            type: "terrain",
            normal: this._getTerrainNormal(x, z).clone(),
            runway: null
        };
    }

    update(deltaTime) {
        if (this.crashed) return;

        const x = this.aircraft.position.x;
        const y = this.aircraft.position.y;
        const z = this.aircraft.position.z;

        if (deltaTime > 0) {
            this.verticalSpeed = (y - this.previousY) / deltaTime;
        }

        this.previousY = y;

        this._checkTargetCollisions();

        if (this.crashed) {
            return;
        }

        const surface = this._getSurface(x, z);
        const gearDown = this.aircraftModel.isLandingGearDown();

        if (this.flightController.isLanding() || this.flightController.isTakingOff()) {
            this.flightController.setGroundSurface(surface.height, surface.normal);
            return;
        }

        if (this.flightController.isGrounded()) {
            if (!gearDown) {
                this._crash("LANDING GEAR RETRACTED ON GROUND");
                return;
            }

            if (surface.type === "water") {
                this._crash("ENTERED WATER");
                return;
            }

            this.flightController.setGroundSurface(surface.height, surface.normal);
            return;
        }

        const clearance = gearDown ? this.gearDownClearance : this.gearUpClearance;

        if (y - clearance > surface.height) {
            return;
        }

        if (surface.type === "water") {
            this._crash("WATER IMPACT");
            return;
        }

        this._handleGroundContact(surface.height, surface.normal, gearDown);
    }

    _handleGroundContact(surfaceHeight, surfaceNormal, gearDown) {
        this.euler.setFromQuaternion(this.aircraft.quaternion, "YXZ");

        const pitch = Math.abs(THREE.MathUtils.radToDeg(this.euler.x));
        const roll = Math.abs(THREE.MathUtils.radToDeg(this.euler.z));

        const speed = this.flightController.getSpeed();
        const descentSpeed = Math.max(0, -this.verticalSpeed);

        const safeLanding =
            gearDown &&
            speed <= this.maxLandingSpeed &&
            descentSpeed <= this.maxLandingVerticalSpeed &&
            pitch <= this.maxLandingPitch &&
            roll <= this.maxLandingRoll;

        if (safeLanding) {
            this._land(surfaceHeight, surfaceNormal, false);
            return;
        }

        const hardLanding =
            gearDown &&
            speed <= this.maxHardLandingSpeed &&
            descentSpeed <= this.maxHardLandingVerticalSpeed &&
            pitch <= this.maxHardLandingPitch &&
            roll <= this.maxHardLandingRoll;

        if (hardLanding) {
            this._land(surfaceHeight, surfaceNormal, true);
            return;
        }

        this._crash("GROUND IMPACT");
    }

    _land(surfaceHeight, surfaceNormal, hardLanding) {
        if (hardLanding) {
            const destroyed = this.aircraftStats.takeDamage(this.hardLandingDamage);

            console.log(`HARD LANDING - ${this.hardLandingDamage} damage`);
            console.log(`HP: ${this.aircraftStats.health}/${this.aircraftStats.maxHealth}`);

            if (destroyed) {
                this._crash("AIRCRAFT DESTROYED");
                return;
            }
        } else {
            console.log("SAFE LANDING");
        }
        this.flightController.beginLanding(surfaceHeight, surfaceNormal);
    }

    _checkTargetCollisions() {
        const aircraftSpheres = this.aircraftModel.getHitSpheres();

        for (const target of this.targets) {
            if (!target || target.isDestroyed()) continue;

            const targetSpheres = target.getHitSpheres
                ? target.getHitSpheres()
                : [target.getBoundingSphere()];

            for (const aircraftSphere of aircraftSpheres) {
                for (const targetSphere of targetSpheres) {
                    if (!targetSphere) continue;

                    if (aircraftSphere.intersectsSphere(targetSphere)) {
                        this._crash("COLLISION");
                        return;
                    }
                }
            }
        }
    }

    _crash(reason) {
        this.crashed = true;

        this.flightController.stop();
        this.flightController.setEnginePowered(false);

        console.log(`AIRCRAFT CRASHED: ${reason}`);

        setTimeout(() => {
            this.aircraftStats.service();
            this.flightController.reset();

            this.crashed = false;
            this.previousY = this.aircraft.position.y;

            console.log("AIRCRAFT RESET");
        }, 1000);
    }

    takeDamage(amount) {
        if (this.crashed) return;

        const destroyed = this.aircraftStats.takeDamage(amount);

        console.log(`PLAYER HIT: -${amount} HP`);
        console.log(`HP: ${this.aircraftStats.health}/${this.aircraftStats.maxHealth}`);

        if (destroyed) {
            this._crash("AIRCRAFT DESTROYED");
        }
    }

    getHitSpheres() {
        return this.aircraftModel.getHitSpheres();
    }

    isDestroyed() {
        return this.crashed || this.aircraftStats.health <= 0;
    }

    isCrashed() {
        return this.crashed;
    }

    isLanded() {
        return this.flightController.isGrounded();
    }

    getVerticalSpeed() {
        return this.verticalSpeed;
    }
}