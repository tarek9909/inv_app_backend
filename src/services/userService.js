const bcrypt = require('bcryptjs');
const { User, Role } = require('../models');

const includeRole = [{ model: Role, as: 'role' }];

const createUser = async (payload) => {
  const password = await bcrypt.hash(payload.password, 10);
  return User.create({ ...payload, password });
};

const updateUser = async (user, payload) => {
  const data = { ...payload };
  if (data.password) data.password = await bcrypt.hash(data.password, 10);
  await user.update(data);
  return User.findByPk(user.id, { include: includeRole });
};

module.exports = { createUser, updateUser, includeRole };
