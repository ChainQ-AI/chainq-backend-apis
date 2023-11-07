function isSelectQuery(query) {
  // Simple check to see if the query starts with "SELECT" (case-insensitive)
  return /^SELECT/i.test(query.trim());
}

module.exports = isSelectQuery;
