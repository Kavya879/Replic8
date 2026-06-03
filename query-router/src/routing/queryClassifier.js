function stripLeadingComments(sql) {
  let cursor = sql.trimStart();

  while (cursor.startsWith('--') || cursor.startsWith('/*')) {
    if (cursor.startsWith('--')) {
      const lineEnd = cursor.indexOf('\n');
      cursor = lineEnd === -1 ? '' : cursor.slice(lineEnd + 1).trimStart();
      continue;
    }

    const commentEnd = cursor.indexOf('*/');
    if (commentEnd === -1) {
      return '';
    }

    cursor = cursor.slice(commentEnd + 2).trimStart();
  }

  return cursor;
}

function classifyQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SQL text is required.');
  }

  const normalized = stripLeadingComments(sql);
  const match = normalized.match(/^([a-zA-Z]+)/);

  if (!match) {
    throw new Error('Unable to detect the SQL statement type.');
  }

  const verb = match[1].toUpperCase();

  if (verb === 'SELECT') {
    return { statementType: 'READ', route: 'replica' };
  }

  if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE') {
    return { statementType: 'WRITE', route: 'primary' };
  }

  throw new Error(`Unsupported SQL statement type: ${verb}`);
}

module.exports = {
  classifyQuery
};