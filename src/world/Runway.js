import * as THREE from "three";

export class Runway {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;

        this.id = config.id;
        this.width = config.width;
        this.length = config.length;
        this.heading = config.heading ?? 0;
        this.height = config.height;

        this.root = new THREE.Group();
        this.root.name = `Runway_${this.id}`;
        this.root.position.set(
            config.center.x,
            this.height + 0.035,
            config.center.z
        );
        this.root.rotation.y = this.heading;

        this._build();

        scene.add(this.root);
    }

    _makePlane(width, length, material, x = 0, z = 0, y = 0) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, length),
            material
        );

        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;

        this.root.add(mesh);
        return mesh;
    }

    _build() {
        const runwayMaterial = new THREE.MeshStandardMaterial({
            color: 0x454545,
            roughness: 0.94,
            metalness: 0
        });

        const markingMaterial = new THREE.MeshStandardMaterial({
            color: 0xe8e5d8,
            roughness: 0.9,
            metalness: 0
        });

        this.surface = this._makePlane(
            this.width,
            this.length,
            runwayMaterial
        );

        const markingY = 0.012;

        this._makePlane(
            0.35,
            this.length - 6,
            markingMaterial,
            -this.width * 0.5 + 1.2,
            0,
            markingY
        );

        this._makePlane(
            0.35,
            this.length - 6,
            markingMaterial,
            this.width * 0.5 - 1.2,
            0,
            markingY
        );

        const dashLength = 8;
        const dashGap = 8;
        const usableLength = this.length - 38;

        for (
            let z = -usableLength * 0.5;
            z <= usableLength * 0.5;
            z += dashLength + dashGap
        ) {
            this._makePlane(
                0.45,
                dashLength,
                markingMaterial,
                0,
                z,
                markingY
            );
        }

        this._buildThreshold(
            -this.length * 0.5 + 8,
            markingMaterial,
            markingY
        );

        this._buildThreshold(
            this.length * 0.5 - 8,
            markingMaterial,
            markingY
        );
    }

    _buildThreshold(z, material, y) {
        const stripeWidth = 1.35;
        const stripeLength = 7;
        const gap = 1.15;

        for (let i = -3; i <= 3; i++) {
            if (i === 0) continue;

            this._makePlane(
                stripeWidth,
                stripeLength,
                material,
                i * gap,
                z,
                y
            );
        }
    }

    contains(worldX, worldZ, margin = 0) {
        const dx = worldX - this.config.center.x;
        const dz = worldZ - this.config.center.z;

        const cos = Math.cos(this.heading);
        const sin = Math.sin(this.heading);

        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;

        return (
            Math.abs(localX) <= this.width * 0.5 + margin &&
            Math.abs(localZ) <= this.length * 0.5 + margin
        );
    }

    getObject3D() {
        return this.root;
    }

    getHeight() {
        return this.height;
    }
}