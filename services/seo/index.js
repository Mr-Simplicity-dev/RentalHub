const db = require('../../config/middleware/database');
const {
  createStore
} = require('./core');
const {
  logAction: audit
} = require('../../config/utils/auditLogger');
const store = createStore(db);
const google = require('./googleConnectionService').createGoogleConnections({
  store,
  audit
});
const search = require('./searchConsoleService').createSearchConsole({
  store,
  google,
  audit
});
const keywords = require('./keywordService').createKeywords({
  store,
  google,
  audit
});
const intelligence = require('./intelligenceService').createIntelligence({
  store,
  search,
  audit
});
const technical = require('./technicalAuditService').createTechnicalAudit({
  store
});
const content = require('./contentPlannerService').createContentPlanner({
  store,
  Blog: require('../../models/Blog'),
  audit
});
module.exports = {
  store,
  google,
  search,
  keywords,
  intelligence,
  technical,
  content
};
