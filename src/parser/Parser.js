/**
 * 解析器抽象基类
 * 
 * 定义解析系统的统一接口，所有语言解析器都必须继承此类。
 * 
 * @module parser/Parser
 */

/**
 * 解析器基类
 * 
 * 抽象类，定义了所有解析器必须实现的方法。
 */
class Parser {
  /**
   * 创建解析器实例
   */
  constructor() {
    if (new.target === Parser) {
      throw new Error('Parser is an abstract class and cannot be instantiated directly');
    }
  }

  /**
   * 解析文件内容
   * 
   * @abstract
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Object} 解析结果
   * @returns {Array<Object>} return.symbols - 符号列表
   * @returns {Array<Object>} return.calls - 调用关系列表
   * @returns {Array<Object>} return.imports - 导入列表
   * @returns {Array<Object>} return.references - 引用关系列表
   */
  parse(filePath, content) {
    throw new Error('Method "parse()" must be implemented');
  }
}

module.exports = Parser;
