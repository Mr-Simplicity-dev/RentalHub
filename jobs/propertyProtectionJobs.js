const { interval, timeout } = require("../services/backgroundJobRuntime");
let started = false;
function startPropertyProtectionJobs() {
  if (started) return;
  started = true;
  const run = () =>
    require("../services/propertyProtectionMaintenance").runProtectionMaintenance();
  interval(run, 300000);
  timeout(run, 20000);
}
module.exports = { startPropertyProtectionJobs };
