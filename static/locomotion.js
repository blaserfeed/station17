export const WALK_SPEED = 3.5;
export const RUN_SPEED = 6.5;
export const WALK_CYCLE = 1.5;
export const RUN_CYCLE = 2.35;
// Each bundled clip contains TWO complete gait cycles (four footfalls).
// These are clip seconds, independent of the player's travel speed.
export const WALK_CLIP_SECONDS = 26 / 15;
export const RUN_CLIP_SECONDS = 4 / 3;
export const CLIP_FOOTFALLS = 4;

export function gaitAdvance(dt, distance, running, walkSeconds=WALK_CLIP_SECONDS, runSeconds=RUN_CLIP_SECONDS) {
 if(dt<=0||distance<=.0005)return 0;
 const blend=Math.max(0,Math.min(1,running));
 const seconds=walkSeconds+(runSeconds-walkSeconds)*blend;
 const travelSpeed=WALK_SPEED+(RUN_SPEED-WALK_SPEED)*blend;
 // Allow a gentle response to acceleration, without speeding up a full clip
 // several times simply because the player covers more game-world metres.
 const rate=Math.min(1.05,distance/dt/travelSpeed);
 return dt*rate/seconds;
}

// Integrate exponential acceleration analytically. Multiplying only the final
// velocity by dt makes starts/stops depend on the browser's frame rate.
export function integrateMotion(velocity, targetX, targetZ, dt, rate) {
 const decay=Math.exp(-rate*dt),integral=(1-decay)/rate;
 const x=targetX*dt+(velocity.x-targetX)*integral;
 const z=targetZ*dt+(velocity.y-targetZ)*integral;
 velocity.x=targetX+(velocity.x-targetX)*decay;
 velocity.y=targetZ+(velocity.y-targetZ)*decay;
 return {x,z};
}
