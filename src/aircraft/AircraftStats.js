export class AircraftStats {
    constructor({
        maxHealth = 100,
        maxFuel = 100,
        innerAmmo = 500,
        outerAmmo = 160,
        maxSupplies = 2
    } = {}) {
        this.maxHealth = maxHealth;
        this.health = maxHealth;

        this.maxFuel = maxFuel;
        this.fuel = maxFuel;
        this.baseFuelConsumption = 0.05;
        this.throttleFuelConsumption = 0.30;

        this.maxInnerAmmo = innerAmmo;
        this.innerAmmo = innerAmmo;

        this.maxOuterAmmo = outerAmmo;
        this.outerAmmo = outerAmmo;

        this.maxSupplies = maxSupplies;
        this.supplies = maxSupplies;
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        return this.health <= 0;
    }

    consumeFuel(amount) {
        this.fuel = Math.max(0, this.fuel - amount);
        return this.fuel > 0;
    }

    updateFuel(deltaTime, throttle) {
        if (this.fuel <= 0) return;

        const consumption = this.baseFuelConsumption + this.throttleFuelConsumption * throttle;
        this.consumeFuel(consumption * deltaTime);
    }

    hasFuel() {
        return this.fuel > 0;
    }

    consumeInnerAmmo(amount = 1) {
        if (this.innerAmmo < amount) return false;
        this.innerAmmo -= amount;
        return true;
    }

    consumeOuterAmmo(amount = 1) {
        if (this.outerAmmo < amount) return false;
        this.outerAmmo -= amount;
        return true;
    }

    consumeSupply() {
        if (this.supplies <= 0) return false;
        this.supplies--;
        return true;
    }

    refuel() {
        this.fuel = this.maxFuel;
    }

    rearm() {
        this.innerAmmo = this.maxInnerAmmo;
        this.outerAmmo = this.maxOuterAmmo;
    }

    reloadSupplies() {
        this.supplies = this.maxSupplies;
    }

    repair() {
        this.health = this.maxHealth;
    }

    service() {
        this.refuel();
        this.rearm();
        this.reloadSupplies();
        this.repair();
    }

    isDestroyed() {
        return this.health <= 0;
    }

    getFuelConsumptionRate(throttle) {
        return this.baseFuelConsumption + this.throttleFuelConsumption * throttle;
    }
}