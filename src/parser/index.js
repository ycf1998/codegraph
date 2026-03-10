/**
 * 解析器工厂
 * 
 * 根据文件扩展名自动选择对应的语言解析器。
 * 
 * @module parser/index
 */

const { LANGUAGES } = require('../constants');

// 解析器缓存，避免重复加载
const parserCache = new Map();

/**
 * 根据文件路径创建解析器实例
 * 
 * 根据文件扩展名自动匹配语言解析器。
 * 
 * @param {string} filePath - 文件路径
 * @returns {Parser} 解析器实例
 * 
 * @example
 * const parser = createParserForFile('UserService.java');
 * // 返回 JavaParser 实例
 */
function createParserForFile(filePath) {
  const ext = getFileExtension(filePath);
  const config = LANGUAGES[ext.toLowerCase()];
  
  if (!config) {
    const supported = Object.keys(LANGUAGES).join(', ');
    throw new Error(
      `Unsupported file type: ${ext}. Supported: ${supported}`
    );
  }
  
  // 从缓存获取解析器
  let parser = parserCache.get(ext);
  if (!parser) {
    // 使用 __dirname 确保路径正确
    const ParserClass = require(require('path').join(__dirname, config.parserModule));
    parser = new ParserClass();
    parserCache.set(ext, parser);
  }
  
  return parser;
}

/**
 * 获取文件扩展名（包含点）
 * @param {string} filePath - 文件路径
 * @returns {string} 文件扩展名
 */
function getFileExtension(filePath) {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.substring(lastDot).toLowerCase();
}

/**
 * 获取所有支持的文件扩展名
 * @returns {Array<string>} 扩展名列表
 */
function getSupportedExtensions() {
  return Object.keys(LANGUAGES);
}

/**
 * 获取语言名称
 * @param {string} ext - 文件扩展名
 * @returns {string} 语言名称
 */
function getLanguageName(ext) {
  const config = LANGUAGES[ext.toLowerCase()];
  return config ? config.name : 'Unknown';
}

module.exports = {
  createParserForFile,
  getFileExtension,
  getSupportedExtensions,
  getLanguageName
};
