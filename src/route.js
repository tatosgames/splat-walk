// The walk through Artillery Passage, north to south: waypoints and moments of attention, in PLY
// coordinates (x across the passage, west wall ~1, east wall ~4; z along it; y down, the floor is
// at y ~ -0.7 to -1.1). Walking south faces +z, so west (small x) is on the left.
//
// Obstacles at walking height, measured from the splat: sticker-covered bollard (2.92, -24.4),
// green bin on the east wall at z -19.4, lamp post (2.78, -13.8) at the mouth of the graffiti
// alley, box on the east wall at z -9.6, black wheelie bin on the west wall (x 0.9-1.7, z 0.3-1.85),
// lamp post with a bicycle (2.3, 9.05), two bins on the east wall at z 16-17.7, bollards
// (1.75, 23.4) and (2.45, 23.4), then more bollards along the kerb around z 27-29.

export const ROUTE = {
    speed: 1.2,
    idleStart: 2.6,
    holdEnd: 6.0,
    waypoints: [
        [2.75, -32.4],
        [2.65, -30.2],
        [2.35, -27.3],
        [2.2, -24.4],
        [2.5, -21.4],
        [2.3, -18.0],
        [1.97, -13.8],
        [2.3, -10.4],
        [2.45, -5.0],
        [2.62, 0.2],
        [2.35, 3.8],
        [1.6, 7.6],
        [1.45, 9.9],
        [1.7, 13.4],
        [1.82, 17.0],
        [1.5, 20.6],
        [1.13, 23.4],
        [1.55, 26.0],
        [2.15, 28.4]
    ],
    looks: [
        // standing on the street: eyes on the red shopfront, then into the passage
        { t: -0.5, in: 0.3, hold: 1.2, out: 1.25, target: [5.2, -2.1, -28.8] },
        // a glance at the tea shop's side windows on the way in
        { at: 5.2, in: 0.6, hold: 0.45, out: 0.85, target: [1.1, -2.1, -21.0], slow: 0.05 },
        // up at the hanging signs and the lamp
        { at: 9.2, in: 0.8, hold: 0.9, out: 0.9, target: [2.7, -5.2, -13.0], slow: 0.06 },
        // the lit graffiti down the side alley
        { at: 16.0, in: 1.05, hold: 0.7, out: 1.4, maxYaw: 60, target: [-1.2, -2.2, -13.9], slow: 0.22 },
        // Grapeshots' door
        { at: 20.6, in: 0.55, hold: 0.55, out: 0.7, target: [4.1, -2.1, -8.6], slow: 0.05 },
        // the restaurant menu in the west window, before the bin
        { at: 26.0, in: 0.6, hold: 0.8, out: 0.7, target: [0.85, -2.3, -2.5], slow: 0.1 },
        // white shop windows on the east side
        { at: 33.0, in: 0.6, hold: 0.9, out: 0.8, target: [3.95, -2.2, 4.5], slow: 0.08 },
        // the blue shopfront
        { at: 45.5, in: 0.6, hold: 0.8, out: 0.8, target: [3.9, -2.4, 19.5], slow: 0.06 },
        // thread between the bollards
        { at: 54.2, in: 0.5, hold: 0.45, out: 0.75, pitch: -9, yaw: 0, slow: 0.12 },
        // out on the street: a look along it toward the old school building, then settle
        { afterStop: 0.7, in: 1.35, hold: 1.4, out: 1.35, target: [-9.0, -3.0, 33.0] }
    ]
};
