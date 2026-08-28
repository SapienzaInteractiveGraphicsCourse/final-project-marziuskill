import * as THREE from "three";
export class Ocean {
    constructor(size = 1200) {
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            new THREE.MeshStandardMaterial({color: 0x287fa3, roughness: 0.35, metalness: 0.05})
        );
        this.mesh.name = "Ocean";
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 0;
        this.mesh.receiveShadow = true;
    }

    getObject3D() {
        return this.mesh;
    }
}