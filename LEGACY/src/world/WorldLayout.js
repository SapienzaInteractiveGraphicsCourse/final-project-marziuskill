const HOME_RUNWAY = {
    id: "homeRunway",
    center: {x: -270, z: 45},
    width: 26,
    length: 145,
    heading: 0,
    height: 5
};

const ENEMY_RUNWAY = {
    id: "enemyRunway",
    center: {x: 100, z: -900},
    width: 24,
    length: 135,
    heading: 0,
    height: 6.5
};

const HOME_AIRFIELD = {
    height: 5,

    apron: {
        center: {x: -234.5, z: 49},
        width: 50,
        length: 44,
        heading: 0
    },

    taxiway: {
        center: {x: -256, z: 45},
        width: 10,
        length: 8,
        heading: Math.PI / 2
    }
};

const ENEMY_AIRFIELD = {
    height: 6.5,

    apron: {
        center: {x: 126, z: -904},
        width: 36,
        length: 40,
        heading: 0
    },

    taxiway: {
        center: {x: 116, z: -900},
        width: 8,
        length: 12,
        heading: Math.PI / 2
    }
};

const ENEMY_FORT_AREA = {
    height: 120,

    plateau: {
        center: {x: -520, z: -780},
        width: 44,
        length: 34,
        heading: 0
    }
};

const ENEMY_FORT_TERRACES = {
    lower: {
        center: {x: -575.74, z: -797.13},
        width: 18,
        length: 12,
        heading: -0.63,
        height: 55,
        falloff: 5
    },

    middle: {
        center: {x: -588.16, z: -780.11},
        width: 18,
        length: 14,
        heading: 0.12,
        height: 62,
        falloff: 5
    },

    upper: {
        center: {x: -571.43, z: -765.92},
        width: 22,
        length: 16,
        heading: 0.87,
        height: 67.2,
        falloff: 6
    }
};

const ENEMY_SERVICE_AREA = {
    center: {x: 126, z: -904},
    width: 36,
    length: 40,
    heading: 0,
    height: 6.5
};

function runwayFlattenZone(runway, {
    widthMargin = 18,
    lengthMargin = 20,
    falloff = 50
} = {}) {
    return {
        id: `${runway.id}Flatten`,
        type: "rectangle",
        center: {...runway.center},
        width: runway.width + widthMargin,
        length: runway.length + lengthMargin,
        heading: runway.heading,
        targetHeight: runway.height,
        falloff
    };
}

function rectangleFlattenZone(id, area, targetHeight, falloff = 20) {
    return {
        id,
        type: "rectangle",
        center: {...area.center},
        width: area.width,
        length: area.length,
        heading: area.heading ?? 0,
        targetHeight,
        falloff
    };
}

export const WORLD_LAYOUT = {
    seaLevel: 0,
    worldSize: 2400,
    terrainCellSize: 4,

    runways: {
        home: HOME_RUNWAY,
        enemy: ENEMY_RUNWAY
    },

    airfields: {
        home: HOME_AIRFIELD,
        enemy: ENEMY_AIRFIELD
    },

    homeBase: {
        hangar: {
            // leggermente più indietro / lontano dalla runway
            position: { x: -242, z: 45 },
            heading: -Math.PI / 2,
            scale: 1
        },

        commandBuilding: {
            position: { x: -226, z: 61 },
            heading: Math.PI,
            scale: 0.74
        },

        watchTower: {
            position: { x: -253, z: 30 },
            heading: 0,
            scale: 1
        },

        radioTower: {
            position: { x: -253, z: 68 },
            heading: 0,
            scale: 1
        },

        serviceArea: {
            // tende: stessa fascia interna, ma più compatte tra loro
            tent: {
                position: { x: -224, z: 35 },
                heading: Math.PI / 2,
                scale: 1
            },

            extraTents: [
                {
                    position: { x: -224, z: 42 },
                    heading: Math.PI / 2,
                    scale: 1
                },
                {
                    position: { x: -224, z: 49 },
                    heading: Math.PI / 2,
                    scale: 1
                }
            ],

            storage: [
                // crates singoli lato watchtower / hangar
                {
                    kind: "crate",
                    position: { x: -233, z: 31 },
                    heading: 0
                },
                {
                    kind: "crate",
                    position: { x: -230.8, z: 31.8 },
                    heading: Math.PI * 0.08
                },

                // barrels singoli un po' separati dall'hangar
                {
                    kind: "barrelA",
                    position: { x: -238, z: 35.5 },
                    heading: 0
                },
                {
                    kind: "barrelB",
                    position: { x: -236.2, z: 36.4 },
                    heading: 0
                },
                {
                    kind: "barrelC",
                    position: { x: -237.1, z: 37.7 },
                    heading: 0
                },

                // covered crates lato watchtower
                {
                    kind: "coveredCrates",
                    position: { x: -246, z: 36 },
                    heading: Math.PI / 2
                },

                // covered barrels vicino all'area tende
                {
                    kind: "coveredBarrels",
                    position: { x: -229, z: 52 },
                    heading: Math.PI / 2
                },

                // davanti al military building, ma più verso la runway
                {
                    kind: "coveredCrates",
                    position: { x: -244, z: 58.5 },
                    heading: Math.PI / 2
                },
                {
                    kind: "coveredBarrels",
                    position: { x: -244, z: 64.5 },
                    heading: Math.PI / 2
                }
            ],

            // nuovo emplacement tra radio tower e storage frontale
            flak18: {
                position: { x: -249, z: 61.5 },
                heading: -Math.PI / 2,
                scale: 1
            }
        }
    },

    enemyFortBase: {
        terraces: ENEMY_FORT_TERRACES,

        battlefield: [
            // LOWER ---------------------------------------------------------

            // Doppio filo spinato:
            // stessa identica posizione, il secondo viene ribaltato
            // attorno al proprio asse longitudinale.
            {
                level: "lower",
                kind: "barbedWire",
                offset: {x: 0, z: 0},
                headingOffset: Math.PI,
                scale: 2.27
            },
            {
                level: "lower",
                kind: "barbedWire",
                offset: {x: 0, z: 0},
                headingOffset: 0,
                scale: 2.27
            },

            {
                level: "lower",
                kind: "metalHedgehog",
                offset: {x: -3.8, z: 0},
                headingOffset: 0.35,
                scale: 1
            },
            {
                level: "lower",
                kind: "woodenHedgehogA",
                offset: {x: 3.8, z: 0},
                headingOffset: -0.35,
                scale: 1
            },

            // Una sola pila al posto dei due sacchi singoli.
            // È centrata verso il lato inferiore della terrazza.
            {
                level: "lower",
                kind: "sandbagsStack",
                offset: {x: 0, z: -2.8},
                headingOffset: 0,
                scale: 1
            },

            // UPPER ---------------------------------------------------------

            // Quello che avevamo già.
            {
                level: "upper",
                kind: "sandbagsStack",
                offset: {x: 0, z: -5.5},
                headingOffset: 0,
                scale: 1
            },

            // Secondo muro, immediatamente accanto al primo.
            {
                level: "upper",
                kind: "sandbagsStack",
                offset: {x: 3.8, z: -5.5},
                headingOffset: 0,
                scale: 1
            }
        ],

        tent: {
            level: "middle",
            offset: {x: -4.2, z: 0},
            headingOffset: Math.PI / 2,
            scale: 1
        },

        storage: [
            {
                level: "middle",
                kind: "coveredCrates",
                offset: {x: 4.0, z: -1.7},
                headingOffset: 0
            },
            {
                level: "middle",
                kind: "coveredBarrels",
                offset: {x: 4.2, z: 2.0},
                headingOffset: 0
            }
        ],

        bunker: {
            level: "upper",
            offset: {x: -4.8, z: 0.5},
            headingOffset: Math.PI,
            scale: 1
        },

        flak18: {
            level: "upper",
            offset: {x: 5.5, z: -0.5},
            headingOffset: -Math.PI / 4,
            scale: 1
        }
    },

    enemyAirbaseBase: {
        // area più compatta: meno spazio inutile a destra e dietro
        apron: {
            center: { x: 131.0, z: -903.0 },
            size: { x: 24.0, z: 32.0 },
            heading: 0
        },

        // taxiway corto, lasciato quasi invariato
        taxiway: {
            center: { x: 119.0, z: -900.5 },
            size: { x: 6.0, z: 8.5 },
            heading: 0
        },

        // HANGAR: lasciato dov’è, perché hai detto che ormai va bene
        hangar: {
            position: { x: 128.8, z: -900.4 },
            heading: -Math.PI / 2,
            scale: 1
        },

        // MILITARY BUILDING: ok così
        commandBuilding: {
            position: { x: 132.4, z: -915.4 },
            heading: Math.PI,
            scale: 0.74
        },

        // RADIO TOWER: ok così
        radioTower: {
            position: { x: 115.0, z: -920.0 },
            heading: 0,
            scale: 1
        },

        // WATCH TOWER: spostata più vicino al resto, per chiudere il vuoto a destra
        watchTower: {
            position: { x: 127, z: -888 },
            heading: 0,
            scale: 1
        },

        // STORAGE: ricompattato sul lato destro
        storage: [
            // covered barrels: angolo in basso a destra
            {
                kind: "coveredBarrels",
                position: { x: 120, z: -891 },
                heading: Math.PI / 2
            },

            // covered crates: angolo in alto a destra
            {
                kind: "coveredCrates",
                position: { x: 135, z: -888 },
                heading: Math.PI / 2
            },

            // single crate, subito dietro i coveredCrates
            {
                kind: "crate",
                position: { x: 141, z: -890.0 },
                heading: 0
            },

            // single barrelC, accanto/al seguito del crate
            {
                kind: "barrelC",
                position: { x: 138, z: -892.0 },
                heading: 0
            }
        ],

        // SACCHI: davvero dietro all’hangar, non più dentro
        battlefield: [
            {
                kind: "sandbagsStack",
                position: { x: 141, z: -902.4 },
                heading: Math.PI / 2,
                scale: 1
            },
            {
                kind: "sandbagsStack",
                position: { x: 141, z: -898.4 },
                heading: Math.PI / 2,
                scale: 1
            }
        ],

        // MITRAGLIATRICI / FLAK: lasciate come sono, dato che hai detto che vanno bene
        flak18: [
            {
                position: { x: 117.0, z: -913.0 },
                heading: Math.PI,
                scale: 1
            },
            {
                position: { x: 117.0, z: -887.0 },
                heading: -Math.PI,
                scale: 1
            }
        ]
    },

    islands: [
        {
            id: "home",
            name: "Home Island",

            center: {x: 0, z: 40},
            size: {x: 650, z: 520},

            maxHeight: 95,

            mountainStrength: 0.58,
            mountainSharpness: 3.2,
            mountainScale: 0.58,

            seed: 1103,
            coastVariation: 0.15,
            noiseScale: 145,

            shoreSlope: 4.2,
            underwaterSlope: 28,
            seabedDepth: 12,
            meshMargin: 1.30,

            flattenZones: [
                runwayFlattenZone(HOME_RUNWAY, {
                    widthMargin: 18,
                    lengthMargin: 20,
                    falloff: 40
                }),

                rectangleFlattenZone(
                    "homeApronFlatten",
                    HOME_AIRFIELD.apron,
                    HOME_AIRFIELD.height,
                    22
                ),

                rectangleFlattenZone(
                    "homeTaxiwayFlatten",
                    HOME_AIRFIELD.taxiway,
                    HOME_AIRFIELD.height,
                    16
                )
            ]
        },

        {
            id: "alliedWest",
            name: "Allied West",

            center: {x: -430, z: -340},
            size: {x: 300, z: 230},

            maxHeight: 55,

            mountainStrength: 0.34,
            mountainSharpness: 3.0,
            mountainScale: 0.65,

            seed: 2217,
            coastVariation: 0.17,
            noiseScale: 78,

            shoreSlope: 3.6,
            underwaterSlope: 28,
            seabedDepth: 12,
            meshMargin: 1.30
        },

        {
            id: "alliedEast",
            name: "Allied East",

            center: {x: 390, z: -460},
            size: {x: 330, z: 250},

            maxHeight: 95,

            mountainStrength: 0.74,
            mountainSharpness: 3.5,
            mountainScale: 0.50,

            seed: 3491,
            coastVariation: 0.19,
            noiseScale: 78,

            shoreSlope: 4.0,
            underwaterSlope: 28,
            seabedDepth: 12,
            meshMargin: 1.30
        },

        {
            id: "enemyFort",
            name: "Enemy Fort",

            center: {x: -520, z: -780},
            size: {x: 420, z: 320},

            maxHeight: 120,

            mountainStrength: 0.62,
            mountainSharpness: 2.4,
            mountainScale: 0.72,

            seed: 4813,
            coastVariation: 0.18,
            noiseScale: 110,

            shoreSlope: 5.0,
            underwaterSlope: 28,
            seabedDepth: 12,
            meshMargin: 1.30,
            flattenZones: [
                rectangleFlattenZone(
                    "enemyFortLowerTerrace",
                    ENEMY_FORT_TERRACES.lower,
                    ENEMY_FORT_TERRACES.lower.height,
                    ENEMY_FORT_TERRACES.lower.falloff
                ),

                rectangleFlattenZone(
                    "enemyFortMiddleTerrace",
                    ENEMY_FORT_TERRACES.middle,
                    ENEMY_FORT_TERRACES.middle.height,
                    ENEMY_FORT_TERRACES.middle.falloff
                ),

                rectangleFlattenZone(
                    "enemyFortUpperTerrace",
                    ENEMY_FORT_TERRACES.upper,
                    ENEMY_FORT_TERRACES.upper.height,
                    ENEMY_FORT_TERRACES.upper.falloff
                )
            ]
        },

        {
            id: "enemyAirbase",
            name: "Enemy Airbase",

            center: {x: 170, z: -900},
            size: {x: 600, z: 460},

            maxHeight: 85,

            mountainStrength: 0.50,
            mountainSharpness: 3.0,
            mountainScale: 0.62,

            seed: 5927,
            coastVariation: 0.14,
            noiseScale: 130,

            shoreSlope: 4.0,
            underwaterSlope: 28,
            seabedDepth: 12,
            meshMargin: 1.30,

            flattenZones: [
                runwayFlattenZone(ENEMY_RUNWAY, {
                    widthMargin: 18,
                    lengthMargin: 20,
                    falloff: 50
                }),

                rectangleFlattenZone(
                    "enemyApronFlatten",
                    ENEMY_AIRFIELD.apron,
                    ENEMY_AIRFIELD.height,
                    24
                ),

                rectangleFlattenZone(
                    "enemyTaxiwayFlatten",
                    ENEMY_AIRFIELD.taxiway,
                    ENEMY_AIRFIELD.height,
                    15
                ),

                rectangleFlattenZone(
                    "enemyServiceAreaFlatten",
                    ENEMY_SERVICE_AREA,
                    ENEMY_SERVICE_AREA.height,
                    16
                )
            ]
        }
    ]
};