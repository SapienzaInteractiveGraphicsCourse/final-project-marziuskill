import * as THREE from "three";
import { TABLE } from "../config/constants.js";

export class PoolTable extends THREE.Group {
  constructor() {
    super();
    this.name = "PoolTable";

    this.materials = this.#createMaterials();

    this.#buildBed();
    this.#buildFrame();
    this.#buildCushions();
    this.#buildLegs();
    this.#buildPockets();
  }

  #createMaterials() {
    return {
      cloth: new THREE.MeshStandardMaterial({
        color: 0x176b4f,
        roughness: 0.92,
        metalness: 0.0
      }),

      wood: new THREE.MeshStandardMaterial({
        color: 0x4d2718,
        roughness: 0.48,
        metalness: 0.02
      }),

      cushion: new THREE.MeshStandardMaterial({
        color: 0x12543f,
        roughness: 0.82,
        metalness: 0.0
      }),

      pocket: new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 1.0,
        metalness: 0.0
      })
    };
  }

  #makeBox(name, size, position, material) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material
    );
    mesh.name = name;
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh);
    return mesh;
  }

  #buildBed() {
    this.#makeBox(
      "PlayingBed",
      new THREE.Vector3(
        TABLE.PLAY_WIDTH,
        TABLE.BED_THICKNESS,
        TABLE.PLAY_LENGTH
      ),
      new THREE.Vector3(
        0,
        TABLE.CLOTH_Y - TABLE.BED_THICKNESS / 2,
        0
      ),
      this.materials.cloth
    );
  }

  #buildFrame() {
    const outerWidth = TABLE.PLAY_WIDTH + 2 * TABLE.FRAME_WIDTH;
    const outerLength = TABLE.PLAY_LENGTH + 2 * TABLE.FRAME_WIDTH;

    const frameY =
      TABLE.CLOTH_Y -
      TABLE.BED_THICKNESS / 2 -
      TABLE.FRAME_HEIGHT / 2 +
      0.02;

    this.#makeBox(
      "FrameLeft",
      new THREE.Vector3(
        TABLE.FRAME_WIDTH,
        TABLE.FRAME_HEIGHT,
        outerLength
      ),
      new THREE.Vector3(
        -(TABLE.PLAY_WIDTH + TABLE.FRAME_WIDTH) / 2,
        frameY,
        0
      ),
      this.materials.wood
    );

    this.#makeBox(
      "FrameRight",
      new THREE.Vector3(
        TABLE.FRAME_WIDTH,
        TABLE.FRAME_HEIGHT,
        outerLength
      ),
      new THREE.Vector3(
        (TABLE.PLAY_WIDTH + TABLE.FRAME_WIDTH) / 2,
        frameY,
        0
      ),
      this.materials.wood
    );

    this.#makeBox(
      "FrameNear",
      new THREE.Vector3(
        TABLE.PLAY_WIDTH,
        TABLE.FRAME_HEIGHT,
        TABLE.FRAME_WIDTH
      ),
      new THREE.Vector3(
        0,
        frameY,
        -(TABLE.PLAY_LENGTH + TABLE.FRAME_WIDTH) / 2
      ),
      this.materials.wood
    );

    this.#makeBox(
      "FrameFar",
      new THREE.Vector3(
        TABLE.PLAY_WIDTH,
        TABLE.FRAME_HEIGHT,
        TABLE.FRAME_WIDTH
      ),
      new THREE.Vector3(
        0,
        frameY,
        (TABLE.PLAY_LENGTH + TABLE.FRAME_WIDTH) / 2
      ),
      this.materials.wood
    );
  }

  #buildCushions() {
    const y = TABLE.CLOTH_Y + TABLE.CUSHION_HEIGHT / 2;

    // In v0.1 the cushions are simple rectangular solids.
    // Later we will split/profile them around the six pocket mouths.
    this.#makeBox(
      "CushionLeft",
      new THREE.Vector3(
        TABLE.CUSHION_DEPTH,
        TABLE.CUSHION_HEIGHT,
        TABLE.PLAY_LENGTH
      ),
      new THREE.Vector3(
        -TABLE.PLAY_WIDTH / 2 + TABLE.CUSHION_DEPTH / 2,
        y,
        0
      ),
      this.materials.cushion
    );

    this.#makeBox(
      "CushionRight",
      new THREE.Vector3(
        TABLE.CUSHION_DEPTH,
        TABLE.CUSHION_HEIGHT,
        TABLE.PLAY_LENGTH
      ),
      new THREE.Vector3(
        TABLE.PLAY_WIDTH / 2 - TABLE.CUSHION_DEPTH / 2,
        y,
        0
      ),
      this.materials.cushion
    );

    this.#makeBox(
      "CushionNear",
      new THREE.Vector3(
        TABLE.PLAY_WIDTH,
        TABLE.CUSHION_HEIGHT,
        TABLE.CUSHION_DEPTH
      ),
      new THREE.Vector3(
        0,
        y,
        -TABLE.PLAY_LENGTH / 2 + TABLE.CUSHION_DEPTH / 2
      ),
      this.materials.cushion
    );

    this.#makeBox(
      "CushionFar",
      new THREE.Vector3(
        TABLE.PLAY_WIDTH,
        TABLE.CUSHION_HEIGHT,
        TABLE.CUSHION_DEPTH
      ),
      new THREE.Vector3(
        0,
        y,
        TABLE.PLAY_LENGTH / 2 - TABLE.CUSHION_DEPTH / 2
      ),
      this.materials.cushion
    );
  }

  #buildLegs() {
    const outerHalfW = (TABLE.PLAY_WIDTH + 2 * TABLE.FRAME_WIDTH) / 2;
    const outerHalfL = (TABLE.PLAY_LENGTH + 2 * TABLE.FRAME_WIDTH) / 2;

    const x = outerHalfW - TABLE.LEG_SIZE * 0.8;
    const z = outerHalfL - TABLE.LEG_SIZE * 0.8;
    const y = TABLE.LEG_HEIGHT / 2;

    const positions = [
      [-x, y, -z],
      [ x, y, -z],
      [-x, y,  z],
      [ x, y,  z]
    ];

    positions.forEach((p, i) => {
      this.#makeBox(
        `Leg${i + 1}`,
        new THREE.Vector3(
          TABLE.LEG_SIZE,
          TABLE.LEG_HEIGHT,
          TABLE.LEG_SIZE
        ),
        new THREE.Vector3(...p),
        this.materials.wood
      );
    });
  }

  #buildPockets() {
    const halfW = TABLE.PLAY_WIDTH / 2;
    const halfL = TABLE.PLAY_LENGTH / 2;
    const y = TABLE.CLOTH_Y + 0.001;

    const pockets = [
      { name: "CornerNW", x: -halfW, z:  halfL, r: TABLE.CORNER_POCKET_RADIUS },
      { name: "CornerNE", x:  halfW, z:  halfL, r: TABLE.CORNER_POCKET_RADIUS },
      { name: "CornerSW", x: -halfW, z: -halfL, r: TABLE.CORNER_POCKET_RADIUS },
      { name: "CornerSE", x:  halfW, z: -halfL, r: TABLE.CORNER_POCKET_RADIUS },
      { name: "SideW",   x: -halfW, z: 0,      r: TABLE.SIDE_POCKET_RADIUS },
      { name: "SideE",   x:  halfW, z: 0,      r: TABLE.SIDE_POCKET_RADIUS }
    ];

    for (const pocket of pockets) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          pocket.r,
          pocket.r * 0.9,
          TABLE.POCKET_VISUAL_DEPTH,
          32
        ),
        this.materials.pocket
      );

      mesh.name = pocket.name;
      mesh.position.set(
        pocket.x,
        y - TABLE.POCKET_VISUAL_DEPTH / 2,
        pocket.z
      );
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }
}
