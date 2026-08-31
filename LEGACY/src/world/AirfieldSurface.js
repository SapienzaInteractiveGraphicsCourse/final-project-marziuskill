import * as THREE from "three";

export class AirfieldSurface {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;

        this.root = new THREE.Group();
        this.root.name = "AirfieldSurface";

        this.apronMaterial = new THREE.MeshStandardMaterial({
            color: 0x66635c,
            roughness: 0.96,
            metalness: 0
        });

        this.taxiwayMaterial = new THREE.MeshStandardMaterial({
            color: 0x454545,
            roughness: 0.94,
            metalness: 0
        });

        this._buildArea(
            config.apron,
            config.height,
            this.apronMaterial
        );

        this._buildArea(
            config.taxiway,
            config.height,
            this.taxiwayMaterial
        );

        scene.add(this.root);
    }

    _buildArea(area, height, material) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(area.width, area.length),
            material
        );

        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -(area.heading ?? 0);

        mesh.position.set(
            area.center.x,
            height + 0.025,
            area.center.z
        );

        mesh.receiveShadow = true;
        this.root.add(mesh);

        return mesh;
    }
}