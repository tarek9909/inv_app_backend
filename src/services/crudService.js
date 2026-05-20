const { Op } = require('sequelize');
const { getPagination, paged, approximatePaged } = require('../utils/pagination');
const HttpError = require('../utils/httpError');

const buildSearch = (fields, search) => {
  if (!search || !fields.length) return {};
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: `%${search}%` } })) };
};

const list = async (Model, query, options = {}) => {
  const { page, limit, offset } = getPagination(query);
  const searchWhere = buildSearch(options.searchFields || [], query.search);
  const baseOptions = {
    where: { ...(options.where || {}), ...searchWhere },
    attributes: options.attributes,
    include: options.include || [],
    order: options.order || [['id', 'DESC']],
    limit: query.exact_count === 'true' ? limit : limit + 1,
    offset,
    distinct: true
  };

  if (query.exact_count === 'true') {
    return paged(await Model.findAndCountAll(baseOptions), page, limit);
  }

  return approximatePaged(await Model.findAll(baseOptions), page, limit, offset);
};

const findOrFail = async (Model, id, options = {}) => {
  const row = await Model.findByPk(id, { include: options.include || [] });
  if (!row) throw new HttpError(404, `${options.name || 'Record'} not found`);
  return row;
};

module.exports = { list, findOrFail };
