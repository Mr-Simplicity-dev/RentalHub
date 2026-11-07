import base64, hashlib, json, math, sys
from pathlib import Path
import cv2
import numpy as np
import torch
from vendor.MiniFASNet import MiniFASNetV2, MiniFASNetV1SE
ROOT=Path(__file__).resolve().parent
cv2.setNumThreads(1);torch.set_num_threads(1)
manifest=json.loads((ROOT/'models/manifest.json').read_text())
for item in manifest['files']:
    if hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('MODEL_INTEGRITY_FAILED')
ENGINE='local-sface-minifas-'+manifest['engine_hash'][:16]
detector=cv2.FaceDetectorYN.create(str(ROOT/'models/yunet.onnx'),'',(320,320),0.9,0.3,5000)
recognizer=cv2.FaceRecognizerSF.create(str(ROOT/'models/sface.onnx'),'')
spoof_models=[]
for filename,scale,model_class in [('minifas-2.7.pth',2.7,MiniFASNetV2),('minifas-4.0.pth',4.0,MiniFASNetV1SE)]:
    model=model_class(conv6_kernel=(5,5));state=torch.load(ROOT/'models'/filename,map_location='cpu',weights_only=True)
    model.load_state_dict({key.removeprefix('module.'):value for key,value in state.items()});model.eval();spoof_models.append((model,scale))
def validated():
    try:
        record=json.loads((ROOT/'validation.json').read_text())
        return record.get('engine')==ENGINE and record.get('false_accepts')==0 and all(isinstance(record.get(k),int) and record[k]>=20 for k in ['genuine_passes','print_attacks_rejected','screen_attacks_rejected','replay_attacks_rejected']) and bool(record.get('approved_by')) and len(record.get('evidence_sha256',''))==64
    except (OSError,ValueError,TypeError):return False
def crop(image,face,scale):
    height,width=image.shape[:2];x,y,w,h=map(float,face[:4]);factor=min(scale,(width-1)/w,(height-1)/h)
    cw,ch=w*factor,h*factor;left=max(0,min(x+w/2-cw/2,width-cw));top=max(0,min(y+h/2-ch/2,height-ch))
    patch=image[int(top):int(top+ch)+1,int(left):int(left+cw)+1]
    return cv2.resize(patch,(80,80))
def analyze(encoded,spoof=True):
    if not isinstance(encoded,str) or len(encoded)>2800000:raise ValueError('IMAGE_SIZE')
    raw=base64.b64decode(encoded.split(',')[-1],validate=True)
    if len(raw)>2000000:raise ValueError('IMAGE_SIZE')
    image=cv2.imdecode(np.frombuffer(raw,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None or image.shape[0]*image.shape[1]>16000000:raise ValueError('INVALID_IMAGE')
    detector.setInputSize((image.shape[1],image.shape[0]));_,faces=detector.detect(image)
    if faces is None or len(faces)!=1:return {'status':'review_required','reason':'exactly_one_face_required','engine':ENGINE}
    face=faces[0]
    if min(face[2:4])<100:return {'status':'review_required','reason':'face_too_small','engine':ENGINE}
    aligned=recognizer.alignCrop(image,face);feature=recognizer.feature(aligned).flatten().astype(float);norm=np.linalg.norm(feature)
    if len(feature)!=128 or not np.isfinite(feature).all() or norm<=0:raise ValueError('INVALID_TEMPLATE')
    feature=feature/norm
    result={'status':'analyzed','engine':ENGINE,'embedding':feature.tolist(),'automation_validated':validated()}
    gray=cv2.cvtColor(aligned,cv2.COLOR_BGR2GRAY);result['quality_ok']=float(cv2.Laplacian(gray,cv2.CV_64F).var())>=40 and 25<float(gray.mean())<230
    if spoof:
        predictions=[]
        with torch.inference_mode():
            for model,scale in spoof_models:
                patch=crop(image,face,scale);tensor=torch.from_numpy(patch.transpose(2,0,1).copy()).float().unsqueeze(0)
                probabilities=torch.softmax(model(tensor),dim=1).numpy()[0];predictions.append(float(probabilities[1]))
        result['live_score']=sum(predictions)/len(predictions)
        result['liveness_status']='live' if result['automation_validated'] and result['quality_ok'] and min(predictions)>=0.98 else 'review_required'
    return result
for line in sys.stdin:
    request={}
    try:
        if len(line)>4000000:raise ValueError('REQUEST_SIZE')
        request=json.loads(line)
        if request.get('operation')=='health':result={'ready':True,'engine':ENGINE,'automatic_acceptance':validated()}
        elif request.get('operation')=='analyze':result=analyze(request.get('image'),request.get('spoof',True) is not False)
        else:raise ValueError('INVALID_OPERATION')
        print(json.dumps({'id':request.get('id'),'result':result},allow_nan=False),flush=True)
    except Exception:
        print(json.dumps({'id':request.get('id'),'result':{'status':'review_required','reason':'local_face_check_unavailable','engine':ENGINE}}),flush=True)
