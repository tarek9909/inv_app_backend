const crypto = require('crypto');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/responses');
const HttpError = require('../utils/httpError');

exports.qzCertificate = asyncHandler(async (req, res) => {
  ok(res, 'QZ certificate loaded', { certificate: config.qz.certificate || '' });
});

exports.qzSign = asyncHandler(async (req, res) => {
  if (!config.qz.privateKey) throw new HttpError(500, 'QZ private key is not configured');
  const request = String(req.body?.request || '');
  if (!request) throw new HttpError(400, 'QZ signing request is required');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(request);
  signer.end();
  const signature = signer.sign(config.qz.privateKey.replace(/\\n/g, '\n'), 'base64');
  ok(res, 'QZ request signed', { signature });
});
