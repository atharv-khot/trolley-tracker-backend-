const { v4: uuidv4 } = require('uuid');

const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toISOString();
};

const generateId = () => {
  return uuidv4();
};

const paginate = (data, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  return {
    data: data.slice(startIndex, endIndex),
    total: data.length,
    page: parseInt(page),
    limit: parseInt(limit)
  };
};

module.exports = {
  formatDate,
  generateId,
  paginate
};
