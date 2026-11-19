let runtime;
const loadRuntime = () => {
  if (!runtime) runtime = (async () => {
    const [tf, landmarks] = await Promise.all([import('@tensorflow/tfjs-core'), import('@tensorflow-models/face-landmarks-detection')]);
    try {
      await import('@tensorflow/tfjs-backend-webgl');
      if (!(await tf.setBackend('webgl'))) throw new Error('WebGL unavailable');
    } catch {
      await import('@tensorflow/tfjs-backend-cpu');
      await tf.setBackend('cpu');
    }
    await tf.ready();
    return landmarks;
  })().catch(error => {runtime = null; throw error;});
  return runtime;
};

// This runtime uses local model files and ordinary JavaScript/WebGL, not eval.
export async function createLiveFaceMesh() {
  const landmarks = await loadRuntime();
  const base = `${import.meta.env.BASE_URL}models/live-face/v1`;
  const detector = await landmarks.createDetector(landmarks.SupportedModels.MediaPipeFaceMesh, {
    runtime:'tfjs', maxFaces:2, refineLandmarks:true,
    detectorModelUrl:`${base}/detector/model.json`,
    landmarkModelUrl:`${base}/landmarks/model.json`,
  });
  let closed = false, running = false, disposed = false, callback = () => {};
  const dispose = () => {if (!disposed) {disposed = true; detector.dispose();}};
  return {
    setOptions() {},
    onResults(next) {callback = next;},
    async send({image}) {
      if (closed || running) return;
      const width = image.videoWidth || image.naturalWidth || image.width;
      const height = image.videoHeight || image.naturalHeight || image.height;
      if (!(width > 0 && height > 0)) return;
      running = true;
      try {
        const faces = await detector.estimateFaces(image, {flipHorizontal:false});
        if (!closed) callback({multiFaceLandmarks:faces.length === 1 ? [faces[0].keypoints.map(p => ({x:p.x/width,y:p.y/height,z:(p.z || 0)/width}))] : []});
      } finally {running = false; if (closed) dispose();}
    },
    close() {closed = true; if (!running) dispose();},
  };
}
