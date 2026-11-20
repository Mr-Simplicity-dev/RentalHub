module.exports = function createArchive(format, options, library = require('archiver')) {
  if (typeof library === 'function') return library(format, options);
  if (format === 'zip' && typeof library?.ZipArchive === 'function') return new library.ZipArchive(options);
  throw new Error('Unsupported archive format or archive library');
};
