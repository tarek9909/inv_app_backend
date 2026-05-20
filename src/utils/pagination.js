const getPagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  return { page, limit, offset: (page - 1) * limit };
};

const paged = ({ rows, count }, page, limit) => ({
  rows,
  meta: {
    page,
    limit,
    total: count,
    pages: Math.ceil(count / limit)
  }
});

const approximatePaged = (rows, page, limit, offset = (page - 1) * limit) => {
  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;
  const total = offset + pageRows.length + (hasNext ? 1 : 0);
  return {
    rows: pageRows,
    meta: {
      page,
      limit,
      total,
      pages: hasNext ? page + 1 : page
    }
  };
};

module.exports = { getPagination, paged, approximatePaged };
