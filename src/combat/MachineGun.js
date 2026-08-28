import * as THREE from "three";
import {Bullet} from "./Bullet.js";

export class MachineGun {
    constructor(scene, aircraftModel, aircraftStats) {
        this.scene = scene;
        this.aircraftModel = aircraftModel;
        this.stats = aircraftStats;

        this.bullets = [];
        this.muzzles = [];
        this.muzzleFlashes = [];
        this.targets = [];

        this.weapons = {
            inner: {
                muzzleNames: ["Muzzle_L1", "Muzzle_R1"],
                muzzles: [],
                fireRate: 14,
                damage: 1,
                bulletSpeed: 170,
                bulletStyle: "inner",
                cooldown: 0
            },
            outer: {
                muzzleNames: ["Muzzle_L2", "Muzzle_R2"],
                muzzles: [],
                fireRate: 6,
                damage: 3,
                bulletSpeed: 170,
                bulletStyle: "outer",
                cooldown: 0
            }
        };

        this.bulletLifetime = 2.5;
        this.flashDuration = 0.04;
        this.flashTimers = new Map();

        this.forward = new THREE.Vector3();
        this.spawnPosition = new THREE.Vector3();

        this.bulletSegment = new THREE.Line3();
        this.closestPoint = new THREE.Vector3();

        this.initialized = false;
    }

    _initialize() {
        this.muzzles = this.aircraftModel.getMuzzles();

        if (this.muzzles.length !== 4) {
            return false;
        }

        for (const weapon of Object.values(this.weapons)) {
            weapon.muzzles = weapon.muzzleNames
                .map((name) => this.muzzles.find((muzzle) => muzzle.name === name))
                .filter((muzzle) => muzzle !== undefined);

            if (weapon.muzzles.length !== 2) {
                console.warn(`Could not initialize weapon group: ${weapon.muzzleNames.join(", ")}`);
                return false;
            }
        }

        const flashGeometry = new THREE.SphereGeometry(0.13, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({color: 0xffaa33, toneMapped: false});

        for (const muzzle of this.muzzles) {
            const flash = new THREE.Mesh(flashGeometry, flashMaterial);
            flash.visible = false;
            muzzle.add(flash);

            this.muzzleFlashes.push(flash);
            this.flashTimers.set(muzzle, 0);
        }

        this.initialized = true;
        console.log("Machine guns initialized.");
        return true;
    }

    update(deltaTime, fireInner, fireOuter) {
        if (!this.initialized && !this._initialize()) {
            return;
        }

        this.weapons.inner.cooldown = Math.max(0, this.weapons.inner.cooldown - deltaTime);
        this.weapons.outer.cooldown = Math.max(0, this.weapons.outer.cooldown - deltaTime);

        if (fireInner) {
            this._updateWeapon(this.weapons.inner, "inner");
        }

        if (fireOuter) {
            this._updateWeapon(this.weapons.outer, "outer");
        }

        this._updateBullets(deltaTime);
        this._updateMuzzleFlashes(deltaTime);
    }

    _updateWeapon(weapon, type) {
        if (weapon.cooldown > 0) {
            return;
        }

        const ammoRequired = weapon.muzzles.length;
        const hasAmmo = type === "inner"
            ? this.stats.consumeInnerAmmo(ammoRequired)
            : this.stats.consumeOuterAmmo(ammoRequired);

        if (!hasAmmo) {
            return;
        }

        this._fireWeapon(weapon);
        weapon.cooldown = 1 / weapon.fireRate;
    }

    _fireWeapon(weapon) {
        const aircraft = this.aircraftModel.getObject3D();
        this.forward.set(0, 0, -1).applyQuaternion(aircraft.quaternion).normalize();

        for (const muzzle of weapon.muzzles) {
            muzzle.getWorldPosition(this.spawnPosition);

            const position = this.spawnPosition.clone();
            position.addScaledVector(this.forward, 0.25);

            const bullet = new Bullet(
                position,
                this.forward,
                weapon.bulletSpeed,
                this.bulletLifetime,
                weapon.damage,
                weapon.bulletStyle
            );

            this.scene.add(bullet.getObject3D());
            this.bullets.push(bullet);

            const flash = this.muzzleFlashes[this.muzzles.indexOf(muzzle)];
            if (flash) {
                flash.visible = true;
                this.flashTimers.set(muzzle, this.flashDuration);
            }
        }
    }

    _updateMuzzleFlashes(deltaTime) {
        for (const muzzle of this.muzzles) {
            let timer = this.flashTimers.get(muzzle) ?? 0;

            if (timer <= 0) {
                continue;
            }

            timer -= deltaTime;
            this.flashTimers.set(muzzle, timer);

            if (timer <= 0) {
                const flash = this.muzzleFlashes[this.muzzles.indexOf(muzzle)];
                if (flash) flash.visible = false;
            }
        }
    }

    _updateBullets(deltaTime) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(deltaTime);

            if (bullet.isAlive()) {
                this._checkBulletHit(bullet);
            }

            if (!bullet.isAlive()) {
                this.scene.remove(bullet.getObject3D());
                this.bullets.splice(i, 1);
            }
        }
    }

    _checkBulletHit(bullet) {
        this.bulletSegment.set(bullet.getPreviousPosition(), bullet.getPosition());

        for (const target of this.targets) {
            if (!target || target.isDestroyed()) continue;

            const spheres = target.getHitSpheres
                ? target.getHitSpheres()
                : [target.getBoundingSphere()];

            for (const sphere of spheres) {
                if (!sphere) continue;

                this.bulletSegment.closestPointToPoint(
                    sphere.center,
                    true,
                    this.closestPoint
                );

                if (this.closestPoint.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius) {
                    target.takeDamage(bullet.damage);
                    bullet.destroy();
                    return true;
                }
            }
        }

        return false;
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

    getBullets() {
        return this.bullets;
    }
}