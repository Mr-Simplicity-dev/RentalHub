const crypto = require('crypto');

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

exports.buildMerkleRoot = (hashes) => {

  if (hashes.length === 0) return null;

  let layer = hashes;

  while (layer.length > 1) {

    const nextLayer = [];

    for (let i = 0; i < layer.length; i += 2) {

      if (i + 1 === layer.length) {
        nextLayer.push(hash(layer[i] + layer[i]));
      } else {
        nextLayer.push(hash(layer[i] + layer[i + 1]));
      }

    }

    layer = nextLayer;
  }

  return layer[0];
};