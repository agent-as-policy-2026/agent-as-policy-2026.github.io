// All intervals and rates refer to the original experiment clock.
export function motionPlaybackRate(motion, runTime, encodedSpeed) {
  const moving = motion.some(([start, end]) => runTime >= start - 1 && runTime <= end + 1);
  return (moving ? 4 : 16) / encodedSpeed;
}
