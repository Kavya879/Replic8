const { classifyQuery } = require('../routing/queryClassifier');

function getSqlFromRequest(req) {
  if (req.body && typeof req.body === 'object' && typeof req.body.sql === 'string') {
    return req.body.sql;
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  return '';
}

function createQueryController(poolRouter) {
  async function executeQuery(req, res, next) {
    try {
      const startedAt = process.hrtime.bigint();
      const sql = getSqlFromRequest(req);
      const params = req.body && typeof req.body === 'object' && Array.isArray(req.body.params)
        ? req.body.params
        : [];
      const classification = classifyQuery(sql);
      const execution = classification.route === 'replica'
        ? await poolRouter.routeRead(sql, params)
        : await poolRouter.routeWrite(sql, params);
      const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

      if (poolRouter.metrics) {
        poolRouter.metrics.queryLatencyHistogram.observe(
          { statement_type: classification.statementType, route: classification.route, pool: execution.poolLabel },
          elapsedSeconds
        );
        poolRouter.metrics.routedQueriesCounter.inc(
          { statement_type: classification.statementType, route: classification.route, pool: execution.poolLabel }
        );
      }

      res.json({
        statementType: classification.statementType,
        route: classification.route,
        pool: execution.poolLabel,
        command: execution.result.command,
        rowCount: execution.result.rowCount,
        rows: execution.result.rows
      });
    } catch (error) {
      next(error);
    }
  }

  return {
    executeQuery
  };
}

module.exports = {
  createQueryController
};