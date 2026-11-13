export const WALK_SPEED = 2.12;
export const RUN_SPEED = 3.82;
// The gait phase covers two full cycles, or four steps.
export const WALK_CYCLE_SECONDS = 2 * 1.12 * 1.9 / WALK_SPEED;
export const RUN_CYCLE_SECONDS = 2 * 1.04 * 3.45 / RUN_SPEED;
export const CLIP_FOOTFALLS = 4;

export function gaitAdvance(dt, distance, running, walkSeconds=WALK_CYCLE_SECONDS, runSeconds=RUN_CYCLE_SECONDS) {
 if(dt<=0||distance<=.0005)return 0;
 const blend=Math.max(0,Math.min(1,running));
 const seconds=walkSeconds+(runSeconds-walkSeconds)*blend;
 const travelSpeed=WALK_SPEED+(RUN_SPEED-WALK_SPEED)*blend;
 // Match the travelled distance during acceleration, capped at the clip rate.
 const rate=Math.min(1,distance/dt/travelSpeed);
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
