process.env.GENERATE_SOURCEMAP = 'false';
process.env.DISABLE_ESLINT_PLUGIN = 'true';

let buildReady = false;
let exited = false;
let stdoutBuffer = '';
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

const finish = (code) => {
  if (exited) return;
  exited = true;
  process.exit(code);
};

const markReadyIfBuilt = (chunk) => {
  const text = chunk.toString();
  stdoutBuffer = `${stdoutBuffer}${text}`.slice(-8000);
  if (
    !buildReady &&
    (stdoutBuffer.includes('The build folder is ready to be deployed.') ||
      stdoutBuffer.includes('https://cra.link/deployment'))
  ) {
    buildReady = true;
    setTimeout(() => {
      finish(0);
    }, 500);
  }
};

process.stdout.write = (chunk, encoding, callback) => {
  markReadyIfBuilt(chunk);
  return originalStdoutWrite(chunk, encoding, callback);
};

process.stderr.write = (chunk, encoding, callback) =>
  originalStderrWrite(chunk, encoding, callback);

require('react-scripts/scripts/build');
