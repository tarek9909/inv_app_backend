const attachmentService = require('../services/attachmentService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/responses');

exports.upload = asyncHandler(async (req, res) => {
  created(res, 'Attachment uploaded', await attachmentService.upload(req.body, req));
});

exports.list = asyncHandler(async (req, res) => {
  const rows = await attachmentService.list(req.query);
  ok(res, 'Attachments loaded', rows, { total: rows.length });
});

exports.download = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.get(req.params.id);
  res.setHeader('Content-Type', attachment.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${String(attachment.file_name).replace(/"/g, '')}"`);
  res.sendFile(attachment.storage_path);
});

exports.remove = asyncHandler(async (req, res) => {
  await attachmentService.remove(req.params.id);
  ok(res, 'Attachment deleted');
});
