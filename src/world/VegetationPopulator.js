import * as THREE from "three";
import {PalmTree} from "./assets/PalmTree.js";
import {TropicalTrees} from "./assets/TropicalTrees.js";
import {Bush} from "./assets/Bush.js";

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

export class VegetationPopulator {
    constructor(scene, terrain, {
        seed = 1,
        exclusions = [],
        palms = 260,
        trees = 3200,
        bushes = 8200,
        rocks = 0
    } = {}) {
        this.scene = scene;
        this.terrain = terrain;
        this.seed = seed >>> 0;
        this.exclusions = exclusions;
        this.counts = {palms, trees, bushes, rocks};

        this.palmTree = new PalmTree(scene);
        this.tropicalTrees = new TropicalTrees(scene);
        this.bush = new Bush(scene);

        this.ready = Promise.all([
            this.palmTree.ready,
            this.tropicalTrees.ready,
            this.bush.ready
        ]);
    }

    _random() {
        this.seed += 0x6D2B79F5;

        let t = this.seed;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);

        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    _range(min, max) {
        return min + (max - min) * this._random();
    }

    _hash2D(ix, iz, salt = 0) {
        let h =
            Math.imul(ix, 374761393) ^
            Math.imul(iz, 668265263) ^
            Math.imul((this.seed + salt) | 0, 1442695041);

        h = Math.imul(h ^ h >>> 13, 1274126177);
        h ^= h >>> 16;

        return (h >>> 0) / 4294967295;
    }

    _spatialNoise(x, z, scale = 45, salt = 0) {
        const px = x / scale;
        const pz = z / scale;

        const x0 = Math.floor(px);
        const z0 = Math.floor(pz);

        const fx = px - x0;
        const fz = pz - z0;

        const sx = fx * fx * (3 - 2 * fx);
        const sz = fz * fz * (3 - 2 * fz);

        const n00 = this._hash2D(x0, z0, salt);
        const n10 = this._hash2D(x0 + 1, z0, salt);
        const n01 = this._hash2D(x0, z0 + 1, salt);
        const n11 = this._hash2D(x0 + 1, z0 + 1, salt);

        const nx0 = THREE.MathUtils.lerp(n00, n10, sx);
        const nx1 = THREE.MathUtils.lerp(n01, n11, sx);

        return THREE.MathUtils.lerp(nx0, nx1, sz);
    }

    _insideRectangle(x, z, zone) {
        const dx = x - zone.center.x;
        const dz = z - zone.center.z;

        const heading = zone.heading ?? 0;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);

        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;

        return Math.abs(localX) <= zone.width * 0.5 &&
               Math.abs(localZ) <= zone.length * 0.5;
    }

    _isExcluded(x, z) {
        return this.exclusions.some(zone => this._insideRectangle(x, z, zone));
    }

    _getBiomeFactors(x, z, height, normalY) {
        const localX = x - this.terrain.center.x;
        const localZ = z - this.terrain.center.y;

        let radius;

        if (typeof this.terrain._normalizedRadius === "function") {
            radius = this.terrain._normalizedRadius(localX, localZ);
        } else {
            radius = Math.hypot(
                localX / this.terrain.radiusX,
                localZ / this.terrain.radiusZ
            );
        }

        const relativeHeight = Math.max(0, height - this.terrain.seaLevel);

        const coast = smoothstep(0.69, 0.96, radius);
        const inland = 1 - smoothstep(0.64, 0.91, radius);

        const lowland = 1 - smoothstep(
            this.terrain.maxHeight * 0.12,
            this.terrain.maxHeight * 0.32,
            relativeHeight
        );

        const upland = smoothstep(
            this.terrain.maxHeight * 0.22,
            this.terrain.maxHeight * 0.68,
            relativeHeight
        );

        const steep = 1 - smoothstep(0.68, 0.88, normalY);

        return {radius, coast, inland, lowland, upland, steep};
    }

    _makeSpatialGrid(cellSize) {
        return {
            cellSize,
            cells: new Map()
        };
    }

    _gridKey(x, z, cellSize) {
        return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    }

    _canPlace(grid, x, z, distance) {
        const cellSize = grid.cellSize;
        const cx = Math.floor(x / cellSize);
        const cz = Math.floor(z / cellSize);
        const radius = Math.ceil(distance / cellSize);
        const distanceSq = distance * distance;

        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const cell = grid.cells.get(`${cx + dx},${cz + dz}`);
                if (!cell) continue;

                for (const point of cell) {
                    const px = point.position.x - x;
                    const pz = point.position.z - z;

                    if (px * px + pz * pz < distanceSq) return false;
                }
            }
        }

        return true;
    }

    _insertGrid(grid, instance) {
        const key = this._gridKey(
            instance.position.x,
            instance.position.z,
            grid.cellSize
        );

        if (!grid.cells.has(key)) grid.cells.set(key, []);
        grid.cells.get(key).push(instance);
    }

    _sample({
        count,
        minHeight,
        maxHeight,
        minNormalY,
        minDistance,
        minScale,
        maxScale,
        weightFn,
        clusterStrength = 0,
        clusterScale = 45,
        clusterSalt = 0
    }) {
        const instances = [];
        const grid = this._makeSpatialGrid(Math.max(minDistance, 1));
        const maxAttempts = count * 180;

        let attempts = 0;

        while (instances.length < count && attempts < maxAttempts) {
            attempts++;

            const x = this.terrain.center.x +
                this._range(-this.terrain.radiusX, this.terrain.radiusX);

            const z = this.terrain.center.y +
                this._range(-this.terrain.radiusZ, this.terrain.radiusZ);

            if (!this.terrain.contains(x, z, 0.5)) continue;
            if (this._isExcluded(x, z)) continue;

            const y = this.terrain.getHeightAt(x, z);
            if (y < minHeight || y > maxHeight) continue;

            const normal = this.terrain.getNormalAt(x, z);
            if (normal.y < minNormalY) continue;

            const biome = this._getBiomeFactors(x, z, y, normal.y);

            let weight = weightFn ? clamp(weightFn({
                x, z,
                height: y,
                normalY: normal.y,
                ...biome
            })) : 1;

            if (clusterStrength > 0) {
                const noise = this._spatialNoise(x, z, clusterScale, clusterSalt);

                /*
                 * La parte importante rispetto a prima:
                 * le zone "vuote" non scendono più a densità molto bassa.
                 *
                 * Otteniamo macchie naturali, ma la foresta resta continua.
                 */
                const cluster = 0.72 + smoothstep(0.20, 0.80, noise) * 0.48;
                weight *= THREE.MathUtils.lerp(1, cluster, clusterStrength);
            }

            if (this._random() > clamp(weight)) continue;
            if (!this._canPlace(grid, x, z, minDistance)) continue;

            const instance = {
                position: new THREE.Vector3(x, y, z),
                heading: this._range(0, Math.PI * 2),
                scale: this._range(minScale, maxScale)
            };

            instances.push(instance);
            this._insertGrid(grid, instance);
        }

        if (instances.length < count) {
            console.warn(
                `Vegetation: requested ${count}, placed ${instances.length}.`
            );
        }

        return instances;
    }

    async populate() {
        await this.ready;

        // PALMS ---------------------------------------------------------------
        // Fascia costiera: prevalenza netta vicino alla spiaggia.
        const palms = this._sample({
            count: this.counts.palms,
            minHeight: this.terrain.seaLevel + 0.7,
            maxHeight: this.terrain.seaLevel + 20,
            minNormalY: 0.88,
            minDistance: 3.8,
            minScale: 0.82,
            maxScale: 1.25,
            clusterStrength: 0.42,
            clusterScale: 28,
            clusterSalt: 101,

            weightFn: ({coast, lowland, inland, steep}) => clamp(
                coast * 0.78 +
                lowland * 0.34 -
                inland * 0.20 -
                steep * 0.55
            )
        });

        // TROPICAL FOREST ------------------------------------------------------
        //
        // Questa è ora la massa principale della giungla.
        //
        // Accettiamo anche pendii moderati e quote abbastanza elevate,
        // ma continuiamo a escludere le vere pareti rocciose.
        const trees = this._sample({
            count: this.counts.trees,
            minHeight: this.terrain.seaLevel + 2,
            maxHeight: this.terrain.seaLevel + this.terrain.maxHeight * 0.70,
            minNormalY: 0.80,
            minDistance: 2.8,
            minScale: 0.78,
            maxScale: 1.30,
            clusterStrength: 0.40,
            clusterScale: 38,
            clusterSalt: 211,

            weightFn: ({coast, inland, upland, steep}) => clamp(
                0.26 +
                inland * 0.74 +
                upland * 0.14 -
                coast * 0.58 -
                steep * 0.72
            )
        });

        // UNDERSTORY -----------------------------------------------------------
        //
        // Molto più fitto degli alberi.
        // Serve a eliminare l'effetto "prato con alberi sparsi".
        const bushes = this._sample({
            count: this.counts.bushes,
            minHeight: this.terrain.seaLevel + 1,
            maxHeight: this.terrain.seaLevel + this.terrain.maxHeight * 0.80,
            minNormalY: 0.72,
            minDistance: 0.85,
            minScale: 0.60,
            maxScale: 1.40,
            clusterStrength: 0.48,
            clusterScale: 24,
            clusterSalt: 307,

            weightFn: ({coast, inland, upland, steep}) => clamp(
                0.40 +
                inland * 0.62 +
                upland * 0.10 -
                coast * 0.26 -
                steep * 0.58
            )
        });

        // ROCKS ---------------------------------------------------------------
        // Per ora completamente disabilitate.
        const rocks = [];

        const treeA = [];
        const treeB = [];

        for (const tree of trees) {
            if (this._random() < 0.58) treeA.push(tree);
            else treeB.push(tree);
        }

        if (palms.length > 0) {
            this.palmTree.createInstanced(palms);
        }

        if (treeA.length > 0) {
            this.tropicalTrees.createInstanced(
                TropicalTrees.TYPES.TREE_A,
                treeA
            );
        }

        if (treeB.length > 0) {
            this.tropicalTrees.createInstanced(
                TropicalTrees.TYPES.TREE_B,
                treeB
            );
        }

        if (bushes.length > 0) {
            this.bush.createInstanced(bushes);
        }

        console.log(
            `Vegetation ${this.terrain.id}: ` +
            `${palms.length} palms, ` +
            `${trees.length} trees, ` +
            `${bushes.length} bushes, ` +
            `${rocks.length} rocks.`
        );

        return {palms, trees, bushes, rocks};
    }
}