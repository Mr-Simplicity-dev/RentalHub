import { load } from '@tensorflow-models/face-detection/dist/tfjs/detector';
import { SupportedModels } from '@tensorflow-models/face-detection/dist/types';

export { SupportedModels };

// The local landmark detector needs this factory, not the MediaPipe runtime.
export function createDetector(model, config = {}) {
  if (model !== SupportedModels.MediaPipeFaceDetector || config.runtime !== 'tfjs') {
    throw new Error('Only the local TensorFlow face detector is supported.');
  }
  return load(config);
}
