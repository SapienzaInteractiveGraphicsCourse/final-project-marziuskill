//DEPENDENCIES
import * as THREE from "three";
import { LIGHTING } from "../config/constants.js";

//LIGHTING
export class LightingSystem {
    constructor(scene, clothY = 0.8, { poolLightAnchors = [] } = {}) {
        this.group = new THREE.Group();
        this.group.name = "LightingSystem";
        const ambient = new THREE.HemisphereLight(0xffe7ce, 0x1d120c, LIGHTING.AMBIENT_INTENSITY);
        ambient.name = "PubAmbient";
        this.group.add(ambient);
        for (let i = 0; i < Math.min(3, poolLightAnchors.length); i += 1) {
            this.#addTablePoint(poolLightAnchors[i], clothY, i);
        }
        this.#addPendant({
            name: "BarPendantLeft",
            x: -1.25,
            z: -3.50,
            color: 0xffb46e,
            intensity: LIGHTING.BAR_PENDANT_INTENSITY
        });
        this.#addPendant({
            name: "BarPendantRight",
            x: 1.25,
            z: -3.50,
            color: 0xffb46e,
            intensity: LIGHTING.BAR_PENDANT_INTENSITY
        });
        this.#addBarWash();
        this.#addPendant({
            name: "EntrancePendant",
            x: 0,
            z: 4.08,
            color: 0xffc58f,
            intensity: LIGHTING.ENTRY_PENDANT_INTENSITY
        });
        this.#addPendant({
            name: "LeftSeatingPendant",
            x: -2.55,
            z: 1.83,
            color: 0xffd2a3,
            intensity: LIGHTING.SIDE_PENDANT_INTENSITY
        });
        this.#addPendant({
            name: "RightSeatingPendant",
            x: 2.55,
            z: 1.83,
            color: 0xffd2a3,
            intensity: LIGHTING.SIDE_PENDANT_INTENSITY
        });
        scene.add(this.group);
    }
    #addBarWash() {
        const light = new THREE.SpotLight(0xffc889, LIGHTING.BAR_WASH_INTENSITY, LIGHTING.BAR_WASH_DISTANCE, LIGHTING.BAR_WASH_ANGLE, LIGHTING.BAR_WASH_PENUMBRA, LIGHTING.BAR_WASH_DECAY);
        light.name = "BarAreaWash";
        light.position.set(0, 3.02, -3.55);
        light.target.position.set(0, 1.05, -3.35);
        light.castShadow = false;
        this.group.add(light);
        this.group.add(light.target);
    }
    #addPendant({ name, x, z, color, intensity }) {
        const shadeY = LIGHTING.PENDANT_SHADE_Y;
        const bulbY = LIGHTING.PENDANT_BULB_Y;
        const ceilingY = LIGHTING.PENDANT_CEILING_Y;
        const fixture = new THREE.Group();
        fixture.name = name;
        fixture.position.set(x, 0, z);
        const metal = new THREE.MeshStandardMaterial({
            color: 0x29231f,
            roughness: 0.46,
            metalness: 0.58,
            side: THREE.DoubleSide
        });
        const bulbMaterial = new THREE.MeshStandardMaterial({
            color: 0xffefd1,
            emissive: color,
            emissiveIntensity: 3.8,
            roughness: 0.22,
            metalness: 0.0
        });
        const ceilingRose = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.035, 20), metal);
        ceilingRose.position.y = ceilingY - 0.0175;
        ceilingRose.castShadow = true;
        ceilingRose.receiveShadow = true;
        fixture.add(ceilingRose);
        const cordTopY = ceilingY - 0.035;
        const cordBottomY = shadeY + 0.09;
        const cordLength = Math.max(0.05, cordTopY - cordBottomY);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordLength, 10), metal);
        cord.position.y = cordBottomY + cordLength / 2;
        cord.castShadow = true;
        fixture.add(cord);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.235, 0.18, 24, 1, true), metal);
        shade.position.y = shadeY;
        shade.castShadow = true;
        shade.receiveShadow = true;
        fixture.add(shade);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 10), bulbMaterial);
        bulb.position.y = bulbY;
        fixture.add(bulb);
        const light = new THREE.SpotLight(color, intensity, LIGHTING.PENDANT_DISTANCE, LIGHTING.PENDANT_ANGLE, LIGHTING.PENDANT_PENUMBRA, LIGHTING.PENDANT_DECAY);
        light.name = `${name}_Light`;
        light.position.y = bulbY;
        light.target.position.set(0, 0.05, 0);
        light.castShadow = false;
        fixture.add(light);
        fixture.add(light.target);
        const localFill = new THREE.PointLight(color, LIGHTING.PENDANT_LOCAL_FILL_INTENSITY, LIGHTING.PENDANT_LOCAL_FILL_DISTANCE, 2);
        localFill.position.y = bulbY;
        fixture.add(localFill);
        this.group.add(fixture);
    }
    #addTablePoint(position, clothY, index) {
        const intensity = LIGHTING.TABLE_POINT_INTENSITIES[index] ?? 32;
        const light = new THREE.PointLight(0xffe4b8, intensity, LIGHTING.TABLE_POINT_DISTANCE, LIGHTING.TABLE_POINT_DECAY);
        light.name = `PoolTablePoint_${index + 1}`;
        light.position.copy(position);
        light.castShadow = true;
        light.shadow.mapSize.set(LIGHTING.TABLE_POINT_SHADOW_MAP_SIZE, LIGHTING.TABLE_POINT_SHADOW_MAP_SIZE);
        light.shadow.camera.near = LIGHTING.TABLE_POINT_SHADOW_NEAR;
        light.shadow.camera.far = LIGHTING.TABLE_POINT_SHADOW_FAR;
        light.shadow.bias = LIGHTING.SHADOW_BIAS;
        light.shadow.normalBias = LIGHTING.SHADOW_NORMAL_BIAS;
        this.group.add(light);
    }
}
