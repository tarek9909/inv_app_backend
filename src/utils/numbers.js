const prefixMap = {
  purchaseOrder: 'PO',
  stockRequest: 'REQ',
  payment: 'PAY'
};

const generateNumber = (type) => {
  const prefix = prefixMap[type] || 'DOC';
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${random}`;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

module.exports = { generateNumber, toMoney };
