import { test, expect, vi } from 'vitest';
import { createDetector, SupportedModels } from './faceDetectionTfjs';
import { load } from '@tensorflow-models/face-detection/dist/tfjs/detector';
vi.mock('@tensorflow-models/face-detection/dist/tfjs/detector',()=>({load:vi.fn()}));
test('the nested face detector uses the real TFJS loader with local model settings',async()=>{const detector={estimateFaces:vi.fn()},config={runtime:'tfjs',modelType:'short',maxFaces:2,detectorModelUrl:'/models/live-face/v1/detector/model.json'};load.mockResolvedValue(detector);expect(await createDetector(SupportedModels.MediaPipeFaceDetector,config)).toBe(detector);expect(load).toHaveBeenCalledWith(config);});
test('unsupported models and runtimes fail explicitly instead of using an undefined global',()=>{expect(()=>createDetector('other',{runtime:'tfjs'})).toThrow('Only the local TensorFlow');expect(()=>createDetector(SupportedModels.MediaPipeFaceDetector,{runtime:'mediapipe'})).toThrow('Only the local TensorFlow');});
