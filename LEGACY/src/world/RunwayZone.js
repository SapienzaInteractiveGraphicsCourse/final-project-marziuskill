import * as THREE from "three";

export class RunwayZone {
    constructor({x = 0, z = 0, height = 0, width = 35, length = 220, heading = 0} = {}) {
        this.x = x;
        this.z = z;
        this.height = height;
        this.width = width;
        this.length = length;
        this.heading = THREE.MathUtils.degToRad(heading);

        this.root = new THREE.Group();
        this.root.position.set(x, height + 0.03, z);
        this.root.rotation.y = this.heading;

        const geometry = new THREE.PlaneGeometry(width, length);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.9
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.root.add(this.mesh);
    }

    containsPoint(x, z) {
        const dx = x - this.x;
        const dz = z - this.z;
        const cos = Math.cos(this.heading);
        const sin = Math.sin(this.heading);
        const localX = cos * dx + sin * dz;
        const localZ = -sin * dx + cos * dz;
        return Math.abs(localX) <= this.width / 2 && Math.abs(localZ) <= this.length / 2;
    }

    getSurfaceHeight() {
        return this.height;
    }

    getObject3D() {
        return this.root;
    }
}