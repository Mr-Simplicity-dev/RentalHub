export const preparePassportDocument = file => new Promise((resolve, reject) => {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) return reject(new Error('Choose a JPEG or PNG image smaller than 10 MB.'));
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The passport image could not be read.')); };
  image.onload = () => {
    try {
      if (image.width * image.height > 16000000 || Math.min(image.width, image.height) < 400) throw new Error('Choose a clear passport page at least 400 pixels wide and tall.');
      const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let encoded;
      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        encoded = canvas.toDataURL('image/jpeg', quality);
        if (encoded.length < 680000) break;
      }
      if (!encoded || encoded.length >= 680000) throw new Error('Choose a smaller, clear passport image.');
      resolve(encoded);
    } catch (error) { reject(error); }
    finally { URL.revokeObjectURL(url); }
  };
  image.src = url;
});
