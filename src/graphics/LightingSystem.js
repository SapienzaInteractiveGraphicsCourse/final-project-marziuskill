import * as THREE from "three";
import { LIGHTING, TABLE } from "../config/constants.js";

export class LightingSystem {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "LightingSystem";

    const ambient = new THREE.HemisphereLight(
      0xdfe8ff,
      0x2a2118,
      LIGHTING.AMBIENT_INTENSITY
    );
    this.group.add(ambient);

    this.#addOverheadLight(-0.62);
    this.#addOverheadLight(0.62);

    scene.add(this.group);
  }

  #addOverheadLight(z) {
    const light = new THREE.SpotLight(
      0xfff2dd,
      LIGHTING.KEY_INTENSITY,
      LIGHTING.KEY_DISTANCE,
      Math.PI / 5.5,
      0.45,
      1.3
    );

    light.position.set(0, LIGHTING.KEY_HEIGHT, z);
    light.target.position.set(0, TABLE.CLOTH_Y, z * 0.35);

    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 8;
    light.shadow.bias = -0.00015;

    this.group.add(light);
    this.group.add(light.target);

    // Simple emissive-looking lamp housing.
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.38, 0.18, 32, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x202225,
        roughness: 0.45,
        metalness: 0.35,
        side: THREE.DoubleSide
      })
    );
    shade.position.copy(light.position);
    shade.position.y += 0.12;
    shade.castShadow = true;
    this.group.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.CircleGeometry(0.25, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe7bd })
    );
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(light.position.x, light.position.y - 0.001, light.position.z);
    this.group.add(bulb);
  }
}
