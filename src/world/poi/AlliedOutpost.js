import * as THREE from "three";

export class AlliedOutpost {
    constructor(scene, {name = "Allied Outpost", position = new THREE.Vector3(), supplyRadius = 35, minDropAltitude = 8, maxDropAltitude = 70} = {}) {
        this.scene = scene;
        this.name = name;
        this.supplyRadius = supplyRadius;
        this.minDropAltitude = minDropAltitude;
        this.maxDropAltitude = maxDropAltitude;
        this.supplied = false;

        this.root = new THREE.Group();
        this.root.name = name;
        this.root.position.copy(position);

        const platform = new THREE.Mesh(
            new THREE.CylinderGeometry(8, 8, 0.6, 16),
            new THREE.MeshStandardMaterial({color: 0x536b4b, roughness: 0.9})
        );
        platform.position.y = 0.3;
        platform.receiveShadow = true;
        this.root.add(platform);

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(8, 4, 6),
            new THREE.MeshStandardMaterial({color: 0x68745c, roughness: 0.8})
        );
        building.position.y = 2.5;
        building.castShadow = true;
        building.receiveShadow = true;
        this.root.add(building);

        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 8, 8),
            new THREE.MeshStandardMaterial({color: 0xaaaaaa, metalness: 0.6, roughness: 0.4})
        );
        mast.position.set(3, 5, 0);
        mast.castShadow = true;
        this.root.add(mast);

        // Temporary supply-zone indicator
        this.zone = new THREE.Mesh(
            new THREE.RingGeometry(this.supplyRadius - 0.4, this.supplyRadius, 64),
            new THREE.MeshBasicMaterial({
                color: 0x55ff88,
                transparent: true,
                opacity: 0.45,
                side: THREE.DoubleSide
            })
        );

        this.zone.rotation.x = -Math.PI / 2;
        this.zone.position.y = 0.08;
        this.root.add(this.zone);

        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 9);
        this.worldPosition = new THREE.Vector3();

        scene.add(this.root);
    }

    containsDropPosition(position) {
        this.root.getWorldPosition(this.worldPosition);

        const dx = position.x - this.worldPosition.x;
        const dz = position.z - this.worldPosition.z;

        return dx * dx + dz * dz <= this.supplyRadius * this.supplyRadius;
    }

    canReceiveSupply(playerPosition) {
        if (this.supplied) return false;

        this.root.getWorldPosition(this.worldPosition);

        const dx = playerPosition.x - this.worldPosition.x;
        const dz = playerPosition.z - this.worldPosition.z;
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const altitude = playerPosition.y - this.worldPosition.y;

        return horizontalDistance <= this.supplyRadius &&
            altitude >= this.minDropAltitude &&
            altitude <= this.maxDropAltitude;
    }

    deliverSupply() {
        if (this.supplied) return false;

        this.supplied = true;

        if (this.zone) {
            this.zone.visible = false;
        }

        console.log(`SUPPLY DELIVERED: ${this.name}`);
        return true;
    }

    getBoundingSphere() {
        this.root.getWorldPosition(this.worldPosition);
        this.boundingSphere.center.copy(this.worldPosition);
        return this.boundingSphere;
    }

    isSupplied() {
        return this.supplied;
    }

    isDestroyed() {
        return false;
    }

    getObject3D() {
        return this.root;
    }
}