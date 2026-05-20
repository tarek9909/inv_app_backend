const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Attachment, PurchaseOrder, StockRequest, Payment, Driver } = require('../models');
const HttpError = require('../utils/httpError');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv']);
const ENTITY_MODELS = {
  purchase_orders: PurchaseOrder,
  stock_requests: StockRequest,
  payments: Payment,
  drivers: Driver
};

const ensureEntity = async (entityType, entityId) => {
  const Model = ENTITY_MODELS[entityType];
  if (!Model) throw new HttpError(400, 'Unsupported attachment entity');
  const row = await Model.findByPk(entityId);
  if (!row) throw new HttpError(404, 'Attachment entity not found');
  return row;
};

const safeName = (name) => path.basename(name).replace(/[^\w.\- ]+/g, '_').slice(0, 180);

const upload = async (payload, req) => {
  await ensureEntity(payload.entity_type, payload.entity_id);
  if (!ALLOWED_MIME.has(payload.mime_type)) throw new HttpError(400, 'File type is not allowed');
  const buffer = Buffer.from(payload.content_base64, 'base64');
  if (!buffer.length || buffer.length > MAX_SIZE) throw new HttpError(400, 'File is empty or exceeds 5MB');

  const dir = path.join(UPLOAD_ROOT, payload.entity_type, String(payload.entity_id));
  fs.mkdirSync(dir, { recursive: true });
  const fileName = safeName(payload.file_name);
  const storageName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${fileName}`;
  const storagePath = path.join(dir, storageName);
  fs.writeFileSync(storagePath, buffer);

  return Attachment.create({
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    file_name: fileName,
    mime_type: payload.mime_type,
    size: buffer.length,
    storage_path: storagePath,
    uploaded_by: req.user.id
  });
};

const list = async ({ entity_type, entity_id }) => {
  await ensureEntity(entity_type, entity_id);
  return Attachment.findAll({ where: { entity_type, entity_id }, order: [['created_at', 'DESC']] });
};

const get = async (id) => {
  const attachment = await Attachment.findByPk(id);
  if (!attachment) throw new HttpError(404, 'Attachment not found');
  return attachment;
};

const remove = async (id) => {
  const attachment = await get(id);
  if (fs.existsSync(attachment.storage_path)) fs.unlinkSync(attachment.storage_path);
  await attachment.destroy();
  return true;
};

module.exports = { upload, list, get, remove };
