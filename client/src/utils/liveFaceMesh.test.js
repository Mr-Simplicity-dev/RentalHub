import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {vi,test,expect,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({setBackend:vi.fn(),ready:vi.fn(),createDetector:vi.fn()}));
vi.mock('@tensorflow/tfjs-core',()=>({setBackend:mock.setBackend,ready:mock.ready}));
vi.mock('@tensorflow/tfjs-backend-webgl',()=>({}));
vi.mock('@tensorflow/tfjs-backend-cpu',()=>({}));
vi.mock('@tensorflow-models/face-landmarks-detection',()=>({SupportedModels:{MediaPipeFaceMesh:'mesh'},createDetector:mock.createDetector}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();mock.setBackend.mockResolvedValue(true);mock.ready.mockResolvedValue();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()});});
test('local model files use the TFJS runtime and normalize pixel coordinates',async()=>{const detector={estimateFaces:vi.fn().mockResolvedValue([{keypoints:[{x:25,y:40,z:2}]}]),dispose:vi.fn()};mock.createDetector.mockResolvedValue(detector);const {createLiveFaceMesh}=await import('./liveFaceMesh');const engine=await createLiveFaceMesh(),results=vi.fn();engine.onResults(results);await engine.send({image:{width:100,height:80}});expect(mock.createDetector.mock.calls[0][1]).toMatchObject({runtime:'tfjs',maxFaces:2,detectorModelUrl:'/models/live-face/v1/detector/model.json'});expect(results.mock.calls[0][0].multiFaceLandmarks[0][0]).toEqual({x:0.25,y:0.5,z:0.02});engine.close();expect(detector.dispose).toHaveBeenCalledOnce();});
test('two faces cannot satisfy the single-person liveness steps',async()=>{mock.createDetector.mockResolvedValue({estimateFaces:vi.fn().mockResolvedValue([{keypoints:[]},{keypoints:[]}]),dispose:vi.fn()});const {createLiveFaceMesh}=await import('./liveFaceMesh');const engine=await createLiveFaceMesh(),results=vi.fn();engine.onResults(results);await engine.send({image:{width:100,height:80}});expect(results).toHaveBeenCalledWith({multiFaceLandmarks:[]});engine.close();});
test('closing during inference stops results and disposes after the pending frame',async()=>{let finish;const detector={estimateFaces:()=>new Promise(resolve=>{finish=resolve;}),dispose:vi.fn()};mock.createDetector.mockResolvedValue(detector);const {createLiveFaceMesh}=await import('./liveFaceMesh');const engine=await createLiveFaceMesh(),results=vi.fn();engine.onResults(results);const pending=engine.send({image:{width:100,height:80}});engine.close();expect(detector.dispose).not.toHaveBeenCalled();finish([]);await pending;expect(results).not.toHaveBeenCalled();expect(detector.dispose).toHaveBeenCalledOnce();});
test('CPU is available when WebGL cannot start',async()=>{mock.setBackend.mockImplementation(async backend=>backend==='cpu');mock.createDetector.mockResolvedValue({dispose:vi.fn()});const {createLiveFaceMesh}=await import('./liveFaceMesh');const engine=await createLiveFaceMesh();expect(mock.setBackend.mock.calls.map(call=>call[0])).toEqual(['webgl','cpu']);engine.close();});

test('all shipped model files match their pinned publisher checksums',()=>{const root=path.resolve('public/models/live-face/v1'),manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));expect(manifest.license).toBe('Apache-2.0');for(const item of manifest.files){const bytes=readFileSync(path.join(root,item.file));expect(bytes.length).toBe(item.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);}});

test('a video with zero element dimensions uses its real camera dimensions for detection',async()=>{
  const detector={estimateFaces:vi.fn().mockResolvedValue([{keypoints:[{x:320,y:240,z:0}]}]),dispose:vi.fn()};
  mock.createDetector.mockResolvedValue(detector);
  const {createLiveFaceMesh}=await import('./liveFaceMesh');const engine=await createLiveFaceMesh(),results=vi.fn();engine.onResults(results);
  const video={width:0,height:0,videoWidth:640,videoHeight:480};await engine.send({image:video});
  const input=detector.estimateFaces.mock.calls[0][0];expect(input).toBeInstanceOf(HTMLCanvasElement);expect(input.width).toBe(640);expect(input.height).toBe(480);
  expect(input.getContext('2d').drawImage).toHaveBeenCalledWith(video,0,0,640,480);
  expect(results.mock.calls[0][0].multiFaceLandmarks[0][0]).toEqual({x:0.5,y:0.5,z:0});engine.close();
});
