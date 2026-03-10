/**
 * 语言配置
 * 
 * 定义支持的语言及其配置：
 * - 文件扩展名
 * - AST 节点类型
 * - 解析器模块
 * 
 * @module languages
 */

const { NODE_TYPES } = require('../constants');

/**
 * 语言配置映射
 */
const LANGUAGES = {
  java: {
    name: 'Java',
    extensions: ['.java'],
    parser: require('../parser/JavaParser'),
    nodeTypes: NODE_TYPES.JAVA
  },
  
  // 预留其他语言支持
  // typescript: {
  //   name: 'TypeScript',
  //   extensions: ['.ts', '.tsx'],
  //   parser: require('../parser/TsParser'),
  //   nodeTypes: NODE_TYPES.TYPESCRIPT
  // },
  
  // python: {
  //   name: 'Python',
  //   extensions: ['.py'],
  //   parser: require('../parser/PyParser'),
  //   nodeTypes: NODE_TYPES.PYTHON
  // }
};

/**
 * 获取语言配置
 * @param {string} language - 语言名称
 * @returns {Object} 语言配置
 */
function getLanguageConfig(language) {
  const lang = LANGUAGES[language.toLowerCase()];
  if (!lang) {
    const supported = Object.keys(LANGUAGES).join(', ');
    throw new Error(`Unsupported language: ${language}. Supported: ${supported}`);
  }
  return lang;
}

/**
 * 创建解析器实例
 * @param {string} language - 语言名称
 * @returns {Object} 解析器实例
 */
function createParser(language) {
  const config = getLanguageConfig(language);
  return new config.parser();
}

/**
 * 获取语言的默认文件扩展名
 * @param {string} language - 语言名称
 * @returns {Array<string>} 扩展名列表
 */
function getExtensions(language) {
  const config = getLanguageConfig(language);
  return config.extensions;
}

/**
 * 获取所有支持的语言列表
 * @returns {Array<string>} 语言名称列表
 */
function getSupportedLanguages() {
  return Object.keys(LANGUAGES);
}

module.exports = {
  LANGUAGES,
  getLanguageConfig,
  createParser,
  getExtensions,
  getSupportedLanguages
};
