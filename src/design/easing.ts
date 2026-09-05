/**
 * animations.md §4: "Default easing is the platform default (`ease`, i.e. CSS `ease` /
 * RN `Easing.inOut(ease)`). No custom cubic-bezier anywhere. No bounce, no spring, no overshoot —
 * overshoot on a confirmation control suggests the value is still settling."
 *
 * Split out from motion.ts so the duration/inventory constants stay importable by Node tests
 * without pulling in the Reanimated native module.
 */
import { Easing } from 'react-native-reanimated';

export const EASING = Easing.inOut(Easing.ease);
