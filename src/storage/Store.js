/**
 * 存储层抽象基类
 * 
 * 定义存储系统的统一接口，所有存储实现（JSON、KuzuDB、SQLite）都必须继承此类。
 * 
 * @module storage/Store
 */

/**
 * 存储基类
 * 
 * 抽象类，定义了存储系统必须实现的所有方法。
 * 子类必须实现所有标记为 @abstract 的方法。
 */
class Store {
  /**
   * 创建存储实例
   * @param {string} dbPath - 数据库路径
   */
  constructor(dbPath) {
    if (new.target === Store) {
      throw new Error('Store is an abstract class and cannot be instantiated directly');
    }
    this.dbPath = dbPath;
  }

  /**
   * 初始化存储
   * @async
   * @abstract
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('Method "init()" must be implemented');
  }

  /**
   * 插入符号
   * @async
   * @abstract
   * @param {Object} symbol - 符号对象
   * @returns {Promise<void>}
   */
  async insertSymbol(symbol) {
    throw new Error('Method "insertSymbol()" must be implemented');
  }

  /**
   * 插入文件记录
   * @async
   * @abstract
   * @param {Object} file - 文件对象
   * @returns {Promise<void>}
   */
  async insertFile(file) {
    throw new Error('Method "insertFile()" must be implemented');
  }

  /**
   * 插入调用关系
   * @async
   * @abstract
   * @param {string} callerName - 调用者方法名
   * @param {string} callerClass - 调用者类名
   * @param {string} calleeName - 被调用方法名
   * @param {string} calleeClass - 被调用类名
   * @param {string} file - 文件名
   * @param {number} line - 行号
   * @returns {Promise<void>}
   */
  async insertCall(callerName, callerClass, calleeName, calleeClass, file, line) {
    throw new Error('Method "insertCall()" must be implemented');
  }

  /**
   * 插入引用关系
   * @async
   * @abstract
   * @param {string} fromName - 引用方名称
   * @param {string} toName - 被引用方名称
   * @param {string} file - 文件名
   * @returns {Promise<void>}
   */
  async insertReference(fromName, toName, file) {
    throw new Error('Method "insertReference()" must be implemented');
  }

  /**
   * 插入定义关系
   * @async
   * @abstract
   * @param {string} symbolName - 符号名
   * @param {string} symbolClass - 类名
   * @param {string} symbolFile - 符号所在文件
   * @param {string} filePath - 定义文件路径
   * @returns {Promise<void>}
   */
  async insertDefinesIn(symbolName, symbolClass, symbolFile, filePath) {
    throw new Error('Method "insertDefinesIn()" must be implemented');
  }

  /**
   * 查找调用者
   * @abstract
   * @param {string} symbolName - 符号名
   * @param {string} symbolClass - 类名
   * @param {number} depth - 查询深度（-1 表示无限）
   * @returns {Array<Object>} 调用者列表
   */
  findCallers(symbolName, symbolClass, depth) {
    throw new Error('Method "findCallers()" must be implemented');
  }

  /**
   * 查找被调用
   * @abstract
   * @param {string} symbolName - 符号名
   * @param {string} symbolClass - 类名
   * @param {number} depth - 查询深度（-1 表示无限）
   * @returns {Array<Object>} 被调用列表
   */
  findCallees(symbolName, symbolClass, depth) {
    throw new Error('Method "findCallees()" must be implemented');
  }

  /**
   * 查找依赖
   * @abstract
   * @param {string} symbolName - 符号名或类名
   * @param {string} symbolClass - 类名
   * @returns {Array<Object>} 依赖列表
   */
  findDependencies(symbolName, symbolClass) {
    throw new Error('Method "findDependencies()" must be implemented');
  }

  /**
   * 影响分析
   * @abstract
   * @param {string} symbolName - 符号名
   * @param {string} symbolClass - 类名
   * @param {number} maxDepth - 最大深度（-1 表示无限）
   * @returns {Array<Object>} 受影响的符号列表
   */
  findImpact(symbolName, symbolClass, maxDepth) {
    throw new Error('Method "findImpact()" must be implemented');
  }

  /**
   * 搜索符号
   * @abstract
   * @param {string} query - 查询字符串
   * @param {string} type - 符号类型（可选）
   * @returns {Array<Object>} 搜索结果
   */
  searchSymbols(query, type) {
    throw new Error('Method "searchSymbols()" must be implemented');
  }

  /**
   * 获取统计信息
   * @abstract
   * @returns {Object} 统计信息
   */
  getStats() {
    throw new Error('Method "getStats()" must be implemented');
  }

  /**
   * 保存数据（仅适用于需要持久化的存储）
   * @async
   * @abstract
   * @returns {Promise<void>}
   */
  async save() {
    throw new Error('Method "save()" must be implemented');
  }

  /**
   * 关闭存储，清理资源
   * @abstract
   * @returns {void}
   */
  close() {
    throw new Error('Method "close()" must be implemented');
  }
}

module.exports = Store;
