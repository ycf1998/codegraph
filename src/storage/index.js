/**
 * 存储工厂
 * 
 * 根据配置创建不同的存储实现（JSON、KuzuDB、SQLite 等）。
 * 
 * @module storage/index
 */

const JsonStore = require('./json-store');
const { STORE_TYPE } = require('../constants');
// const KuzuStore = require('./kuzu-store'); // 未来扩展

/**
 * 存储类型枚举
 */
const StoreType = {
  JSON: 'json',
  KUZU: 'kuzu',
  SQLITE: 'sqlite'
};

/**
 * 创建存储实例
 * 
 * 根据 constants.js 中配置的 STORE_TYPE 创建对应的存储实现。
 * 
 * @param {string} [type=STORE_TYPE] - 存储类型，默认使用 constants 中的配置
 * @param {string} dbPath - 数据库路径
 * @returns {Store} 存储实例
 * 
 * @example
 * const store = createStore(); // 使用 constants.js 中的 STORE_TYPE
 * await store.init();
 */
function createStore(type = STORE_TYPE, dbPath) {
  switch (type.toLowerCase()) {
    case StoreType.JSON:
      return new JsonStore(dbPath);
    
    // 未来扩展示例
    // case StoreType.KUZU:
    //   return new KuzuStore(dbPath);
    
    default:
      throw new Error(
        `Unknown store type: ${type}. ` +
        `Supported types: ${Object.values(StoreType).join(', ')}`
      );
  }
}

module.exports = {
  StoreType,
  createStore,
  JsonStore
  // KuzuStore  // 未来导出
};
