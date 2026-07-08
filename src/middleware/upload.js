'use strict';

/**
 * Upload de imagem em memória (multer) + helper que normaliza a imagem
 * vinda de duas formas:
 *   1) multipart/form-data, campo "imagem" (arquivo)
 *   2) JSON com { imagem_base64, imagem_mimetype }  (ou data URL)
 *
 * Retorna { base64, mimetype, buffer } ou null.
 */

const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB — prints são pequenos
});

/**
 * Extrai a imagem do request (depois do multer ter rodado).
 * @param {import('express').Request} req
 * @returns {{base64:string, mimetype:string, buffer:Buffer}|null}
 */
function imagemDoRequest(req) {
  // 1) arquivo multipart
  if (req.file && req.file.buffer) {
    return {
      base64: req.file.buffer.toString('base64'),
      mimetype: req.file.mimetype || 'image/png',
      buffer: req.file.buffer,
    };
  }

  // 2) base64 no corpo JSON
  const body = req.body || {};
  let b64 = body.imagem_base64 || body.imagem || null;
  if (b64 && typeof b64 === 'string') {
    let mimetype = body.imagem_mimetype || 'image/png';
    // aceita data URL: data:image/png;base64,xxxx
    const m = b64.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) {
      mimetype = m[1];
      b64 = m[2];
    }
    try {
      const buffer = Buffer.from(b64, 'base64');
      if (buffer.length > 0) return { base64: b64, mimetype, buffer };
    } catch (_) {
      return null;
    }
  }

  return null;
}

function fileParaImagem(f) {
  return {
    base64: f.buffer.toString('base64'),
    mimetype: f.mimetype || 'image/png',
    buffer: f.buffer,
  };
}

/**
 * Extrai UMA OU MAIS imagens do request (depois do multer .array ter rodado).
 * Aceita vários arquivos (campo "imagem" repetido), um arquivo só, ou base64.
 * @returns {Array<{base64,mimetype,buffer}>}
 */
function imagensDoRequest(req) {
  if (Array.isArray(req.files) && req.files.length) {
    return req.files.filter((f) => f && f.buffer).map(fileParaImagem);
  }
  const uma = imagemDoRequest(req);
  return uma ? [uma] : [];
}

module.exports = { upload, imagemDoRequest, imagensDoRequest };
