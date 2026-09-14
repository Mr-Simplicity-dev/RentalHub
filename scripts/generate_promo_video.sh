#!/usr/bin/env bash
set -e

mkdir -p client/build/promo video-ads/rendered

OUT_FILE="client/build/promo/rentalhub-promo.mp4"
OUT_FILE_VA="video-ads/rendered/rentalhub-promo.mp4"
FONT="/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
LOGO="client/public/rentalhub-mark-512x512.png"

echo "Rendering 1080x1920 15-second vertical promo video with ffmpeg..."

ffmpeg -y \
  -f lavfi -i "color=c=#061b3a:s=1080x1920:d=15:r=30" \
  -loop 1 -i "$LOGO" \
  -filter_complex "
    [1:v]scale=280:280,format=rgba[logo];
    [0:v]
      drawbox=x=0:y=0:w=1080:h=1920:color=#061b3a:t=fill,
      drawbox=x=40:y=40:w=1000:h=1840:color=#ffc928@0.2:t=4,
      drawtext=fontfile='$FONT':text='RENTALHUB NG':fontsize=42:fontcolor=#ffc928:x=(w-text_w)/2:y=120:enable='between(t,0,15)',
      drawbox=x=80:y=500:w=920:h=460:color=#dc2626@0.9:t=fill:enable='between(t,0.3,3.5)',
      drawtext=fontfile='$FONT':text='STOP PAYING':fontsize=64:fontcolor=#ffffff:x=(w-text_w)/2:y=580:enable='between(t,0.4,3.5)',
      drawtext=fontfile='$FONT':text='FAKE AGENTS':fontsize=76:fontcolor=#ffdd00:x=(w-text_w)/2:y=680:enable='between(t,0.7,3.5)',
      drawtext=fontfile='$FONT':text='FOR HOUSES THAT DONT EXIST':fontsize=42:fontcolor=#ffffff:x=(w-text_w)/2:y=800:enable='between(t,1.0,3.5)',
      drawbox=x=80:y=450:w=920:h=560:color=#0284c7@0.95:t=fill:enable='between(t,3.7,7.5)',
      drawtext=fontfile='$FONT':text='THERE IS A BETTER WAY':fontsize=38:fontcolor=#ffc928:x=(w-text_w)/2:y=500:enable='between(t,3.8,7.5)',
      drawtext=fontfile='$FONT':text='SEARCH VERIFIED HOMES':fontsize=56:fontcolor=#ffffff:x=(w-text_w)/2:y=590:enable='between(t,4.1,7.5)',
      drawtext=fontfile='$FONT':text='DIRECT FROM LANDLORDS':fontsize=48:fontcolor=#ffffff:x=(w-text_w)/2:y=680:enable='between(t,4.5,7.5)',
      drawtext=fontfile='$FONT':text='Across Lagos, Abuja and 36 States':fontsize=38:fontcolor=#e0f2fe:x=(w-text_w)/2:y=790:enable='between(t,4.9,7.5)',
      drawbox=x=90:y=460:w=900:h=600:color=#0a2145@0.95:t=fill:enable='between(t,7.7,11.5)',
      drawbox=x=90:y=460:w=900:h=600:color=#ffc928@0.4:t=3:enable='between(t,7.7,11.5)',
      drawtext=fontfile='$FONT':text='WHY RENTALHUB NG?':fontsize=42:fontcolor=#ffc928:x=(w-text_w)/2:y=510:enable='between(t,7.8,11.5)',
      drawtext=fontfile='$FONT':text='+ Zero Ghost Listings':fontsize=44:fontcolor=#ffffff:x=140:y=610:enable='between(t,8.1,11.5)',
      drawtext=fontfile='$FONT':text='+ Verified Inspections':fontsize=44:fontcolor=#ffffff:x=140:y=710:enable='between(t,8.5,11.5)',
      drawtext=fontfile='$FONT':text='+ Secure In-App Payment':fontsize=44:fontcolor=#ffffff:x=140:y=810:enable='between(t,8.9,11.5)',
      drawtext=fontfile='$FONT':text='+ Real Tenant Reviews':fontsize=44:fontcolor=#ffffff:x=140:y=910:enable='between(t,9.3,11.5)',
      drawbox=x=80:y=430:w=920:h=700:color=#0284c7@0.95:t=fill:enable='between(t,11.7,15)',
      drawtext=fontfile='$FONT':text='FIND YOUR NEXT HOME':fontsize=60:fontcolor=#ffffff:x=(w-text_w)/2:y=510:enable='between(t,11.8,15)',
      drawtext=fontfile='$FONT':text='TODAY':fontsize=66:fontcolor=#ffc928:x=(w-text_w)/2:y=600:enable='between(t,12.1,15)',
      drawtext=fontfile='$FONT':text='Download RentalHub NG':fontsize=46:fontcolor=#ffffff:x=(w-text_w)/2:y=730:enable='between(t,12.4,15)',
      drawtext=fontfile='$FONT':text='Available on Web, iOS and Android':fontsize=38:fontcolor=#e0f2fe:x=(w-text_w)/2:y=820:enable='between(t,12.7,15)',
      drawbox=x=160:y=920:w=760:h=120:color=#ffc928:t=fill:enable='between(t,13.0,15)',
      drawtext=fontfile='$FONT':text='rentalhub.com.ng':fontsize=50:fontcolor=#061b3a:x=(w-text_w)/2:y=955:enable='between(t,13.0,15)'
    [bg];
    [bg][logo]overlay=x=(W-w)/2:y=1380:enable='between(t,0,15)'[v];
    aevalsrc=exprs='0.12*sin(2*PI*220*t)*(1+0.4*sin(2*PI*4*t)) + 0.08*sin(2*PI*440*t) + 0.05*sin(2*PI*554.37*t) + 0.06*sin(2*PI*659.25*t)':s=44100:d=15[a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 \
  -shortest \
  "$OUT_FILE"

cp "$OUT_FILE" "$OUT_FILE_VA"
echo "Video rendered successfully to $OUT_FILE and $OUT_FILE_VA"
