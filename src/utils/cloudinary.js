'use strict';

/**
 * Upload opcional de prints pro Cloudinary.
 * Na Fase 1 é OPCIONAL: se CLOUDINARY_URL não estiver setado, as funções
 * viram no-op e retornam null — calibração e demais fluxos seguem normais.
 */

let cloudinary = null;
let habilitado = false;

try {
  if (process.env.CLOUDINARY_URL) {
    // o SDK lê CLOUDINARY_URL automaticamente do ambiente
    cloudinary = require('cloudinary').v2;
    habilitado = true;
  }
} catch (err) {
  console.warn('[cloudinary] SDK indisponível:', err.message);
}

/**
 * Sobe um buffer de imagem. Retorna a URL segura ou null (se desabilitado/erro).
 * @param {Buffer} buffer
 * @param {Object} [opts]
 * @param {string} [opts.folder='garimpo-pc']
 * @returns {Promise<string|null>}
 */
async function uploadImagem(buffer, opts = {}) {
  if (!habilitado || !buffer) return null;
  const folder = opts.folder || 'garimpo-pc';
  return new Promise((resolve) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) {
          console.warn('[cloudinary] upload falhou:', err.message);
          return resolve(null);
        }
        resolve(result && result.secure_url ? result.secure_url : null);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadImagem, cloudinaryHabilitado: () => habilitado };
