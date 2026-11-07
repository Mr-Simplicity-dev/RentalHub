import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path('/var/www/rentalhub/tools/local-face');(ROOT/'models').mkdir(parents=True,exist_ok=True);(ROOT/'vendor').mkdir(exist_ok=True)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RentalHub-local-face-setup'}),timeout=120) as response:return response.read()
def revision(repo,branch):return json.loads(get('https://api.github.com/repos/'+repo+'/commits/'+branch))['sha']
opencv=revision('opencv/opencv_zoo','main');mini=revision('minivision-ai/Silent-Face-Anti-Spoofing','master')
files=[]
items=[('models/yunet.onnx',f'https://media.githubusercontent.com/media/opencv/opencv_zoo/{opencv}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'),('models/sface.onnx',f'https://media.githubusercontent.com/media/opencv/opencv_zoo/{opencv}/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'),('models/minifas-2.7.pth',f'https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/{mini}/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth'),('models/minifas-4.0.pth',f'https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/{mini}/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.pth'),('vendor/MiniFASNet.py',f'https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/{mini}/src/model_lib/MiniFASNet.py')]
# The upstream second model name is discovered explicitly from its pinned tree.
tree=json.loads(get('https://api.github.com/repos/minivision-ai/Silent-Face-Anti-Spoofing/git/trees/'+mini+'?recursive=1'))
second=[item['path'] for item in tree['tree'] if item['path'].startswith('resources/anti_spoof_models/') and 'MiniFASNetV1SE.pth' in item['path']]
assert len(second)==1
items[3]=('models/minifas-4.0.pth','https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/'+mini+'/'+second[0])
for name,url in items:
    data=get(url);assert len(data)>1000 and not data.startswith(b'version https://git-lfs');(ROOT/name).write_bytes(data);files.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'source':url});print('Installed',name,len(data),'bytes',flush=True)
for name,url in [('LICENSE-OPENCV-SFACE',f'https://raw.githubusercontent.com/opencv/opencv_zoo/{opencv}/models/face_recognition_sface/LICENSE'),('LICENSE-OPENCV-YUNET',f'https://raw.githubusercontent.com/opencv/opencv_zoo/{opencv}/models/face_detection_yunet/LICENSE'),('LICENSE-MINIFAS',f'https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/{mini}/LICENSE')]:
    (ROOT/name).write_bytes(get(url))
(ROOT/'vendor/__init__.py').touch();manifest={'files':files,'opencv_revision':opencv,'minifas_revision':mini,'engine_hash':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()};(ROOT/'models/manifest.json').write_text(json.dumps(manifest,indent=2))
print('Model installation and integrity manifest complete. No face images submitted.')
